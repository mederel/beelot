//! Keyed tokens for IP addresses (US-129). Security events keep a token, not the address: the same address gives the same
//! token, so abuse can still be counted, but the address cannot be read from the database. The key is a server secret
//! (`BEELOT_IP_TOKEN_SECRET`), kept outside the database and the repository.

use std::net::IpAddr;
use std::sync::OnceLock;

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

static SECRET: OnceLock<Vec<u8>> = OnceLock::new();

/// Sets the secret, once, at startup. The server refuses to start without one; tests run with an empty key.
pub fn init(secret: &str) {
    let _ = SECRET.set(secret.as_bytes().to_vec());
}

/// The token of an address: the hexadecimal HMAC-SHA-256 of its canonical text, 64 characters.
pub fn ip_token(ip: IpAddr) -> String {
    let key = SECRET.get().map_or(&[][..], Vec::as_slice);
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("an HMAC takes a key of any length");
    mac.update(ip.to_canonical().to_string().as_bytes());
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_address_gives_the_same_token_and_another_gives_another() {
        let one: IpAddr = "10.0.0.1".parse().unwrap();
        let two: IpAddr = "10.0.0.2".parse().unwrap();
        assert_eq!(ip_token(one), ip_token(one));
        assert_ne!(ip_token(one), ip_token(two));
    }

    #[test]
    fn a_token_is_64_hex_digits_and_does_not_contain_the_address() {
        let token = ip_token("192.168.1.20".parse().unwrap());
        assert_eq!(token.len(), 64);
        assert!(token.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert!(!token.contains("192"));
    }

    #[test]
    fn an_address_and_its_mapped_form_share_a_token() {
        let plain: IpAddr = "10.0.0.1".parse().unwrap();
        let mapped: IpAddr = "::ffff:10.0.0.1".parse().unwrap();
        assert_eq!(ip_token(plain), ip_token(mapped));
    }
}
