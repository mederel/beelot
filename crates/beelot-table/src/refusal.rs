//! Why a table turned a request down. The server maps each to the HTTP response it sends: the status, the stable code
//! of a conflict and its message, which the frontend renders from the message's code.

use std::fmt;

use crate::messages::Message;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refusal {
    /// There is nothing of that kind at this table (a hint or a review of an online table, for example).
    NotFound,
    /// The actor does not belong at this table.
    NotSeated,
    /// A move or a request the rules do not allow now.
    Conflict {
        code: &'static str,
        message: Message,
    },
    /// A bug: a bot made a move the rules refuse.
    Internal(String),
}

impl Refusal {
    /// A conflict carrying its stable code and its message.
    pub fn conflict(code: &'static str, message: Message) -> Self {
        Refusal::Conflict { code, message }
    }
}

impl fmt::Display for Refusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Refusal::NotFound => f.write_str("not found"),
            Refusal::NotSeated => f.write_str("not seated at this table"),
            Refusal::Conflict { message, .. } => f.write_str(message.english()),
            Refusal::Internal(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for Refusal {}
