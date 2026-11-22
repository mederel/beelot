//! MariaDB through sqlx: the pool, the embedded migrations, and one repository module per table.

pub mod accounts;
pub mod daily;
pub mod events;
pub mod friends;
pub mod matches;
pub mod passkeys;
pub mod ratings;
pub mod sessions;
pub mod tables;

use sqlx::mysql::{
    MySql, MySqlConnectOptions, MySqlPool, MySqlPoolOptions, MySqlTypeInfo, MySqlValueRef,
};
use sqlx::types::uuid::fmt::Hyphenated;
use sqlx::{Decode, Type};
use time::{OffsetDateTime, PrimitiveDateTime, UtcOffset};
use uuid::Uuid;

use anyhow::Context as _;

use crate::config::Config;

/// The connection options of the configuration: a URL that does not parse is an error naming its variable (US-190).
pub fn options(config: &Config) -> anyhow::Result<MySqlConnectOptions> {
    let options: MySqlConnectOptions = config.database_url.parse().context(
        "BEELOT_DATABASE_URL is not a valid database URL \
             (for example mysql://localhost:3306/beelot)",
    )?;
    Ok(options
        .username(&config.database_username)
        .password(&config.database_password))
}

/// Connects to the configured database and brings its schema up to date.
pub async fn connect(config: &Config) -> anyhow::Result<MySqlPool> {
    let pool = MySqlPoolOptions::new()
        .connect_with(options(config)?)
        .await?;
    migrate(&pool).await?;
    Ok(pool)
}

pub async fn migrate(pool: &MySqlPool) -> anyhow::Result<()> {
    sqlx::migrate!().run(pool).await?;
    Ok(())
}

/// Whether the database answers a trivial query.
pub async fn ping(pool: &MySqlPool) -> sqlx::Result<()> {
    crate::traces::db("db.ping", async move {
        sqlx::query("SELECT 1").execute(pool).await?;
        Ok(())
    })
    .await
}

/// A time as the database keeps it: `DATETIME(6)` in UTC.
pub fn utc(time: OffsetDateTime) -> PrimitiveDateTime {
    let time = time.to_offset(UtcOffset::UTC);
    PrimitiveDateTime::new(time.date(), time.time())
}

/// A time read back from the database.
pub fn from_utc(time: PrimitiveDateTime) -> OffsetDateTime {
    time.assume_utc()
}

/// MariaDB's `UUID` columns read and write the hyphenated text form.
pub fn id(uuid: Uuid) -> Hyphenated {
    uuid.hyphenated()
}

/// A `UUID` column as read back: MariaDB sends its text form, flagged as binary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DbUuid(pub Uuid);

impl Type<MySql> for DbUuid {
    fn type_info() -> MySqlTypeInfo {
        <&[u8] as Type<MySql>>::type_info()
    }

    fn compatible(ty: &MySqlTypeInfo) -> bool {
        <&[u8] as Type<MySql>>::compatible(ty) || <&str as Type<MySql>>::compatible(ty)
    }
}

impl<'r> Decode<'r, MySql> for DbUuid {
    fn decode(value: MySqlValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let bytes = <&[u8] as Decode<MySql>>::decode(value)?;
        let uuid = match bytes.len() {
            16 => Uuid::from_slice(bytes)?,
            _ => Uuid::try_parse_ascii(bytes)?,
        };
        Ok(DbUuid(uuid))
    }
}
