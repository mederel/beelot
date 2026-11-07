//! Glicko-2 ratings (Glickman, 2013) for public matches, on the familiar scale where a new player has 1500 with a
//! deviation of 350.
//!
//! Each finished match is one rating period for each of its four players: a player is rated against the opposing
//! team, whose rating is the mean of its two players' ratings and whose deviation is the root mean square of theirs.
//! The time between matches is not modelled, so the deviation only shrinks with play.

use std::f64::consts::PI;

const SCALE: f64 = 173.7178;
const CENTRE: f64 = 1500.0;
/// How fast the volatility may change; Glickman suggests 0.3 to 1.2, lower for results with little upset.
const TAU: f64 = 0.5;
const EPSILON: f64 = 1e-6;
const MAX_DEVIATION: f64 = 350.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Glicko {
    pub rating: f64,
    pub deviation: f64,
    pub volatility: f64,
}

impl Glicko {
    /// A player with no rated match.
    pub const NEW: Glicko = Glicko {
        rating: CENTRE,
        deviation: MAX_DEVIATION,
        volatility: 0.06,
    };

    /// The rating of a team of players: the mean rating, and the deviation of the mean of independent estimates.
    pub fn team(players: &[Glicko]) -> Glicko {
        let count = players.len() as f64;
        let rating = players.iter().map(|player| player.rating).sum::<f64>() / count;
        let variance = players
            .iter()
            .map(|player| player.deviation.powi(2))
            .sum::<f64>()
            / count;
        Glicko {
            rating,
            deviation: variance.sqrt(),
            volatility: Glicko::NEW.volatility,
        }
    }

    /// The player's rating after one rating period in which they scored `score` (1 for a win, 0 for a loss, 0.5 for a
    /// draw) against `opponent`.
    pub fn after(self, opponent: Glicko, score: f64) -> Glicko {
        let mu = (self.rating - CENTRE) / SCALE;
        let phi = self.deviation / SCALE;
        let mu_opponent = (opponent.rating - CENTRE) / SCALE;
        let g = discount(opponent.deviation / SCALE);
        let expected = 1.0 / (1.0 + (-g * (mu - mu_opponent)).exp());
        let variance = 1.0 / (g * g * expected * (1.0 - expected));
        let improvement = variance * g * (score - expected);
        let volatility = self.new_volatility(phi, variance, improvement);
        let pre_period = (phi * phi + volatility * volatility).sqrt();
        let new_phi = 1.0 / (1.0 / (pre_period * pre_period) + 1.0 / variance).sqrt();
        let new_mu = mu + new_phi * new_phi * g * (score - expected);
        Glicko {
            rating: SCALE * new_mu + CENTRE,
            deviation: (SCALE * new_phi).min(MAX_DEVIATION),
            volatility,
        }
    }

    /// Step 5 of the algorithm: the new volatility, found by the Illinois method.
    fn new_volatility(self, phi: f64, variance: f64, improvement: f64) -> f64 {
        let a = (self.volatility * self.volatility).ln();
        let delta_squared = improvement * improvement / (variance * variance);
        let f = |x: f64| {
            let e = x.exp();
            let denominator = phi * phi + variance + e;
            e * (delta_squared - phi * phi - variance - e) / (2.0 * denominator * denominator)
                - (x - a) / (TAU * TAU)
        };
        let mut low = a;
        let mut high = if delta_squared > phi * phi + variance {
            (delta_squared - phi * phi - variance).ln()
        } else {
            let mut k = 1.0;
            while f(a - k * TAU) < 0.0 {
                k += 1.0;
            }
            a - k * TAU
        };
        let (mut f_low, mut f_high) = (f(low), f(high));
        while (high - low).abs() > EPSILON {
            let middle = low + (low - high) * f_low / (f_high - f_low);
            let f_middle = f(middle);
            if f_middle * f_high <= 0.0 {
                low = high;
                f_low = f_high;
            } else {
                f_low /= 2.0;
            }
            high = middle;
            f_high = f_middle;
        }
        (low / 2.0).exp()
    }
}

fn discount(phi: f64) -> f64 {
    1.0 / (1.0 + 3.0 * phi * phi / (PI * PI)).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(actual: f64, expected: f64, tolerance: f64) {
        assert!(
            (actual - expected).abs() < tolerance,
            "{actual} is not {expected}"
        );
    }

    #[test]
    fn a_win_against_an_equal_raises_a_new_rating_and_lowers_its_deviation() {
        let after = Glicko::NEW.after(Glicko::NEW, 1.0);
        assert!(after.rating > 1500.0);
        assert!(after.deviation < 350.0);
    }

    #[test]
    fn a_loss_lowers_the_rating() {
        assert!(Glicko::NEW.after(Glicko::NEW, 0.0).rating < 1500.0);
    }

    #[test]
    fn an_upset_moves_a_rating_more_than_an_expected_win() {
        let player = Glicko {
            rating: 1500.0,
            deviation: 100.0,
            volatility: 0.06,
        };
        let strong = Glicko {
            rating: 1800.0,
            deviation: 100.0,
            volatility: 0.06,
        };
        let weak = Glicko {
            rating: 1200.0,
            deviation: 100.0,
            volatility: 0.06,
        };
        let upset = player.after(strong, 1.0).rating - 1500.0;
        let expected = player.after(weak, 1.0).rating - 1500.0;
        assert!(upset > expected && expected > 0.0);
    }

    #[test]
    fn a_win_and_a_loss_between_equal_established_players_balance() {
        let player = Glicko {
            rating: 1500.0,
            deviation: 60.0,
            volatility: 0.06,
        };
        let winner = player.after(player, 1.0);
        let loser = player.after(player, 0.0);
        close(winner.rating - 1500.0, 1500.0 - loser.rating, 1e-6);
    }

    #[test]
    fn a_team_is_rated_by_its_mean() {
        let team = Glicko::team(&[
            Glicko {
                rating: 1400.0,
                deviation: 100.0,
                volatility: 0.06,
            },
            Glicko {
                rating: 1600.0,
                deviation: 100.0,
                volatility: 0.06,
            },
        ]);
        close(team.rating, 1500.0, 1e-9);
        close(team.deviation, 100.0, 1e-9);
    }

    #[test]
    fn it_matches_glickmans_worked_example_for_one_opponent() {
        // Rating 1500, deviation 200, volatility 0.06 against 1400 (deviation 30) won: Glickman's first game.
        let player = Glicko {
            rating: 1500.0,
            deviation: 200.0,
            volatility: 0.06,
        };
        let opponent = Glicko {
            rating: 1400.0,
            deviation: 30.0,
            volatility: 0.06,
        };
        let after = player.after(opponent, 1.0);
        assert!(after.rating > 1500.0 && after.rating < 1600.0);
        assert!(after.deviation < 200.0 && after.deviation > 150.0);
        close(after.volatility, 0.06, 0.005);
    }
}
