//! The daily deal (US-150): one deal a day (UTC), the same for everyone, drawn from the date and a server secret so it
//! cannot be known in advance. A signed-in player plays it once; the score of that one round is what is ranked.

use beelot_game::Variant;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use time::Date;
use uuid::Uuid;

/// The seed of a day's cards and first dealer: a keyed hash of the date, so the same date and secret always give the
/// same deal and nobody without the secret can work it out.
pub fn deal_seed(secret: &str, day: Date) -> i64 {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("a key of any length is accepted");
    mac.update(b"beelot-daily-deal:");
    mac.update(day.to_string().as_bytes());
    let digest = mac.finalize().into_bytes();
    i64::from_be_bytes(digest[..8].try_into().expect("a digest holds eight bytes"))
}

/// The variant alternates with the days: Belote one day, Contrée the next.
pub fn variant_of(day: Date) -> Variant {
    if day.to_julian_day() % 2 == 0 {
        Variant::Classic
    } else {
        Variant::Contree
    }
}

/// What a finished daily round hands over: the day, the signed-in player and the points their team scored in the round.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DailyResult {
    pub day: Date,
    pub account: Uuid,
    pub score: i32,
}

/// The rank of each score of a list sorted from the best: equal scores share a rank.
pub fn ranks(scores: &[i32]) -> Vec<i64> {
    let mut ranks: Vec<i64> = Vec::with_capacity(scores.len());
    for (index, score) in scores.iter().enumerate() {
        let rank = match index.checked_sub(1) {
            Some(previous) if scores[previous] == *score => ranks[previous],
            _ => index as i64 + 1,
        };
        ranks.push(rank);
    }
    ranks
}

#[cfg(test)]
mod tests {
    use time::macros::date;

    use super::*;

    #[test]
    fn the_same_day_and_secret_give_the_same_deal() {
        let day = date!(2026 - 11 - 13);
        assert_eq!(deal_seed("a secret", day), deal_seed("a secret", day));
    }

    #[test]
    fn two_days_or_two_secrets_give_two_deals() {
        let day = date!(2026 - 11 - 13);
        assert_ne!(deal_seed("a secret", day), deal_seed("a secret", date!(2026 - 11 - 14)));
        assert_ne!(deal_seed("a secret", day), deal_seed("another", day));
    }

    #[test]
    fn the_variant_alternates_day_after_day() {
        let mut day = date!(2026 - 11 - 13);
        let mut previous = variant_of(day);
        for _ in 0..10 {
            day = day.next_day().unwrap();
            let variant = variant_of(day);
            assert_ne!(variant, previous);
            previous = variant;
        }
    }

    #[test]
    fn equal_scores_share_a_rank() {
        assert_eq!(ranks(&[162, 140, 140, 90]), vec![1, 2, 2, 4]);
        assert_eq!(ranks(&[]), Vec::<i64>::new());
    }
}
