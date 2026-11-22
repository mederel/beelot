//! The request body limit: every legitimate request is a tiny JSON document, except the browser's spans (US-189).

use axum::body::Body;
use axum::extract::Request;
use axum::http::header;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use http_body_util::Limited;

use crate::browser_traces;
use crate::error::AppError;

/// The most a request to `path` may hold: the spans' route has its own, larger limit.
fn limit_for(path: &str, max_bytes: usize) -> usize {
    if path == browser_traces::SPANS_PATH {
        browser_traces::MAX_BODY
    } else {
        max_bytes
    }
}

/// Refuses with 413 a body that declares, or turns out while it is read, to be over its limit.
pub async fn limit(max_bytes: usize, request: Request, next: Next) -> Response {
    let max = limit_for(request.uri().path(), max_bytes);
    let declared = request
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok());
    if declared.is_some_and(|length| length > max) {
        return AppError::PayloadTooLarge.into_response();
    }
    let (parts, body) = request.into_parts();
    let request = Request::from_parts(parts, Body::new(Limited::new(body, max)));
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::body::{Body, Bytes};
    use axum::http::{Request, StatusCode};
    use axum::routing::post;
    use tower::ServiceExt;

    use super::*;

    fn app() -> Router {
        Router::new()
            .route(
                "/",
                post(|body: Bytes| async move { body.len().to_string() }),
            )
            .layer(axum::middleware::from_fn(|request, next| {
                limit(100, request, next)
            }))
    }

    /// A body sent in chunks, declaring no length.
    fn streamed(len: usize) -> Body {
        let chunks = vec![
            Ok::<_, std::io::Error>(Bytes::from(vec![b'a'; len / 2])),
            Ok(Bytes::from(vec![b'a'; len - len / 2])),
        ];
        Body::from_stream(futures_stream(chunks))
    }

    fn futures_stream(
        chunks: Vec<Result<Bytes, std::io::Error>>,
    ) -> impl tokio_stream::Stream<Item = Result<Bytes, std::io::Error>> {
        tokio_stream::iter(chunks)
    }

    #[tokio::test]
    async fn reads_a_streamed_body_up_to_the_limit() {
        let response = app()
            .oneshot(Request::post("/").body(streamed(100)).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn the_spans_route_has_its_own_limit() {
        assert_eq!(limit_for("/api/tables", 4096), 4096);
        assert_eq!(
            limit_for(browser_traces::SPANS_PATH, 4096),
            browser_traces::MAX_BODY
        );
    }

    #[tokio::test]
    async fn refuses_a_declared_length_over_the_limit() {
        let response = app()
            .oneshot(
                Request::post("/")
                    .header(header::CONTENT_LENGTH, "101")
                    .body(Body::from(vec![b'a'; 101]))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }

    #[tokio::test]
    async fn refuses_a_streamed_body_once_it_is_too_large() {
        let response = app()
            .oneshot(Request::post("/").body(streamed(101)).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }
}
