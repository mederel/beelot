//! The page of an invite link, `/join/{code}` (US-212). Link crawlers (WhatsApp, Messenger, Slack, ...) run no script, so
//! the Open Graph tags of the preview are written into the single page's `<head>` here. The table is never looked up: the
//! tags hold only the code that is already in the link, so a preview reveals nothing about a table.

use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;

use crate::app::AppState;
use crate::auth::pseudonyms::{Language, language};
use crate::tables::codes::ALPHABET;

pub fn routes() -> Router<AppState> {
    Router::new().route("/join/{code}", get(page))
}

/// The code of a link as the table has it (upper case), if it is one: six characters of the codes' alphabet.
fn valid_code(text: &str) -> Option<String> {
    let code = text.to_ascii_uppercase();
    (code.len() == 6 && code.chars().all(|letter| ALPHABET.contains(letter))).then_some(code)
}

/// What a preview says, by language: the title, the description, the image's description and the Open Graph locale.
fn words(language: Language) -> (&'static str, &'static str, &'static str, &'static str) {
    match language {
        Language::French => (
            "Rejoignez ma table de belote sur Beelot",
            "Un ami vous invite à une partie de belote. Un clic pour rejoindre la table, sans compte.",
            "Beelot, la belote en ligne",
            "fr_FR",
        ),
        Language::Dutch => (
            "Kom aan mijn belote-tafel op Beelot",
            "Een vriend nodigt je uit voor een partij belote. Eén tik om aan tafel te gaan, zonder account.",
            "Beelot, belote online",
            "nl_NL",
        ),
        Language::English => (
            "Join my belote table on Beelot",
            "A friend invites you to a game of belote. One tap to take a seat, no account needed.",
            "Beelot, belote online",
            "en_US",
        ),
    }
}

/// Text as the content of an attribute.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// The meta tags of the preview of the table `code`, for the site at `origin`.
fn tags(origin: &str, code: &str, language: Language) -> String {
    let (title, description, alt, locale) = words(language);
    let origin = escape(origin.trim_end_matches('/'));
    let properties = [
        ("og:type", "website".to_owned()),
        ("og:site_name", "Beelot".to_owned()),
        ("og:title", title.to_owned()),
        ("og:description", description.to_owned()),
        ("og:url", format!("{origin}/join/{code}")),
        ("og:locale", locale.to_owned()),
        ("og:image", format!("{origin}/og-image.png")),
        ("og:image:width", "1200".to_owned()),
        ("og:image:height", "630".to_owned()),
        ("og:image:alt", alt.to_owned()),
    ];
    let mut html = String::new();
    for (property, content) in properties {
        html.push_str(&format!(
            "    <meta property=\"{property}\" content=\"{content}\">\n"
        ));
    }
    html.push_str("    <meta name=\"twitter:card\" content=\"summary_large_image\">\n");
    html.push_str(&format!(
        "    <meta name=\"twitter:title\" content=\"{title}\">\n"
    ));
    html.push_str(&format!(
        "    <meta name=\"twitter:description\" content=\"{description}\">\n"
    ));
    html.push_str("    <meta name=\"robots\" content=\"noindex\">\n");
    html
}

/// The single page, with the preview's tags when the link holds a code.
async fn page(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Ok(index) = tokio::fs::read_to_string(state.config.static_dir.join("index.html")).await
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let accept = headers
        .get(header::ACCEPT_LANGUAGE)
        .and_then(|value| value.to_str().ok());
    let html = match (valid_code(&code), index.find("</head>")) {
        (Some(code), Some(end)) => {
            let tags = tags(&state.config.public_url, &code, language(None, accept));
            format!("{}{tags}{}", &index[..end], &index[end..])
        }
        _ => index,
    };
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_code_of_the_alphabet_is_one() {
        assert_eq!(valid_code("abc234").as_deref(), Some("ABC234"));
        for text in [
            "", "ABC23", "ABC2345", "ABCO23", "AB C23", "<b>123", "ABC23é",
        ] {
            assert_eq!(valid_code(text), None, "{text}");
        }
    }

    #[test]
    fn text_in_an_attribute_cannot_close_it() {
        assert_eq!(escape("a\"><b>&"), "a&quot;&gt;&lt;b&gt;&amp;");
    }
}
