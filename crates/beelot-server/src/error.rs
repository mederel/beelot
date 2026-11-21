//! The errors a request can end with, and the JSON body each one answers:
//! `{"error": code, "message": english, "code": message code, "params": {...}}`.
//!
//! `error` says what failed and several messages may share it; `code` and `params` name the text the frontend shows in
//! the player's language. The English `message` stays for one release, for pages loaded before the deploy.

use axum::Json;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use beelot_table::messages::{self as msg, Message};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    /// A body or a parameter that cannot be read.
    #[error("bad request")]
    BadRequest,
    #[error("{message}")]
    Conflict {
        code: &'static str,
        message: Message,
    },
    /// A bad player token, a failed passkey, or a guest where an account is needed.
    #[error("{message}")]
    Unauthorized {
        code: &'static str,
        message: Message,
    },
    /// A missing CSRF token (`reason` is `None`), or a refusal the frontend acts on through its reason.
    #[error("forbidden")]
    Forbidden { reason: Option<&'static str> },
    #[error("payload too large")]
    PayloadTooLarge,
    #[error("rate limited")]
    RateLimited { retry_after_secs: u64 },
    #[error("capacity exceeded")]
    CapacityExceeded,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<beelot_table::Refusal> for AppError {
    fn from(refusal: beelot_table::Refusal) -> Self {
        use beelot_table::Refusal;
        match refusal {
            Refusal::NotFound => AppError::NotFound,
            Refusal::NotSeated => AppError::table_unauthorized(),
            Refusal::Conflict { code, message } => AppError::Conflict { code, message },
            Refusal::Internal(message) => AppError::Internal(anyhow::anyhow!(message)),
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        AppError::Internal(error.into())
    }
}

impl AppError {
    /// A conflict carrying its message.
    pub fn conflict(code: &'static str, message: Message) -> Self {
        AppError::Conflict { code, message }
    }

    /// A refusal for a guest where an account is needed.
    pub fn sign_in_required(message: Message) -> Self {
        AppError::Unauthorized {
            code: "sign-in-required",
            message,
        }
    }

    /// A missing or bad player token.
    pub fn table_unauthorized() -> Self {
        AppError::Unauthorized {
            code: "unauthorized",
            message: msg::TABLE_UNAUTHORIZED,
        }
    }

    pub fn status(&self) -> StatusCode {
        match self {
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::BadRequest => StatusCode::BAD_REQUEST,
            AppError::Conflict { .. } => StatusCode::CONFLICT,
            AppError::Unauthorized { .. } => StatusCode::UNAUTHORIZED,
            AppError::Forbidden { .. } => StatusCode::FORBIDDEN,
            AppError::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            AppError::RateLimited { .. } => StatusCode::TOO_MANY_REQUESTS,
            AppError::CapacityExceeded => StatusCode::SERVICE_UNAVAILABLE,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

/// Set on the response to an invitation code that names no table, so the rate limit can count the guess.
#[derive(Debug, Clone, Copy)]
pub struct InvalidCode;

fn body(code: &str, message: &Message) -> serde_json::Value {
    json!({ "error": code, "message": message.english(), "code": message.code, "params": message.params })
}

fn retry_after(mut response: Response, seconds: u64) -> Response {
    response
        .headers_mut()
        .insert(header::RETRY_AFTER, HeaderValue::from(seconds));
    response
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status();
        match self {
            AppError::NotFound => {
                (status, Json(body("not-found", &msg::NOT_FOUND))).into_response()
            }
            AppError::BadRequest => {
                (status, Json(body("bad-request", &msg::BAD_REQUEST))).into_response()
            }
            AppError::Conflict { code, message } => {
                let mut response = (status, Json(body(code, &message))).into_response();
                if code == "invalid-code" {
                    response.extensions_mut().insert(InvalidCode);
                }
                response
            }
            AppError::Unauthorized { code, message } => {
                (status, Json(body(code, &message))).into_response()
            }
            AppError::Forbidden { reason: None } => {
                (status, Json(body("csrf", &msg::FORBIDDEN))).into_response()
            }
            AppError::Forbidden {
                reason: Some(reason),
            } => {
                let message = match reason {
                    "reauthenticate" => msg::REAUTHENTICATE,
                    _ => msg::FORBIDDEN,
                };
                let mut value = body(reason, &message);
                value["reason"] = reason.into();
                (status, Json(value)).into_response()
            }
            AppError::PayloadTooLarge => (
                status,
                Json(body("payload-too-large", &msg::PAYLOAD_TOO_LARGE)),
            )
                .into_response(),
            AppError::RateLimited { retry_after_secs } => retry_after(
                (status, Json(body("rate-limited", &msg::RATE_LIMITED))).into_response(),
                retry_after_secs,
            ),
            AppError::CapacityExceeded => retry_after(
                (status, Json(body("capacity-exceeded", &msg::BUSY))).into_response(),
                60,
            ),
            AppError::Internal(error) => {
                tracing::error!(error = %format!("{error:#}"), "request failed");
                (status, Json(body("internal", &msg::INTERNAL))).into_response()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::body::to_bytes;

    use super::*;

    async fn parts(error: AppError) -> (StatusCode, Option<String>, serde_json::Value) {
        let response = error.into_response();
        let status = response.status();
        let retry = response
            .headers()
            .get(header::RETRY_AFTER)
            .map(|v| v.to_str().unwrap().to_owned());
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, retry, serde_json::from_slice(&bytes).unwrap())
    }

    /// A table's refusals answer what the table's `AppError`s answered before the rules moved to `beelot-table`.
    #[tokio::test]
    async fn a_tables_refusals_answer_the_same_statuses_codes_and_messages() {
        use beelot_table::Refusal;

        let (status, _, body) =
            parts(Refusal::conflict("seat-taken", msg::SEAT_TAKEN).into()).await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error"], "seat-taken");
        assert_eq!(body["message"], "That seat is taken.");
        assert_eq!(body["code"], "seat-taken");
        assert_eq!(body["params"], json!({}));

        let (status, _, body) = parts(Refusal::NotFound.into()).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"], "not-found");

        let (status, _, body) = parts(Refusal::NotSeated.into()).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["message"], msg::TABLE_UNAUTHORIZED.english());

        let (status, _, body) =
            parts(Refusal::Internal("a bot made an illegal move".into()).into()).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert!(
            !body.to_string().contains("illegal"),
            "an internal error stays opaque"
        );
    }

    #[tokio::test]
    async fn each_error_has_its_status_and_body() {
        let (status, _, body) = parts(AppError::conflict(
            "not-your-turn",
            msg::NOT_YOUR_TURN_TO_BID,
        ))
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(
            body,
            json!({"error": "not-your-turn", "message": "It is not your turn to bid.", "code": "not-your-turn-to-bid", "params": {}})
        );

        let (status, _, body) = parts(AppError::table_unauthorized()).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["message"], msg::TABLE_UNAUTHORIZED.english());

        let (status, _, body) = parts(AppError::Forbidden { reason: None }).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(
            body,
            json!({"error": "csrf", "message": "Forbidden", "code": "forbidden", "params": {}})
        );

        let (_, _, body) = parts(AppError::Forbidden {
            reason: Some("reauthenticate"),
        })
        .await;
        assert_eq!(
            body,
            json!({"error": "reauthenticate", "message": msg::REAUTHENTICATE.english(), "code": "reauthenticate", "params": {}, "reason": "reauthenticate"})
        );

        let (status, retry, body) = parts(AppError::RateLimited {
            retry_after_secs: 12,
        })
        .await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(retry.as_deref(), Some("12"));
        assert_eq!(body["message"], msg::RATE_LIMITED.english());
        assert_eq!(body["code"], "rate-limited");

        let (status, retry, body) = parts(AppError::CapacityExceeded).await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(retry.as_deref(), Some("60"));
        assert_eq!(body["message"], msg::BUSY.english());
    }

    #[tokio::test]
    async fn internal_errors_have_an_opaque_body() {
        let (status, _, body) =
            parts(AppError::Internal(anyhow::anyhow!("db password=hunter2"))).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert!(!body.to_string().contains("hunter2"));
        assert_eq!(body["error"], "internal");
    }
}
