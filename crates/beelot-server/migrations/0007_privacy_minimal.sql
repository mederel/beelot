-- US-129: Beelot keeps one sign-in date, the last one, and no readable IP address.
ALTER TABLE account DROP COLUMN previous_sign_in_at;

-- Security events keep a keyed token of the address (HMAC-SHA-256 with a server secret), not the address. Addresses
-- recorded before cannot be tokenized in SQL, so they are erased.
ALTER TABLE security_event CHANGE ip_address ip_token VARCHAR(64);
UPDATE security_event SET ip_token = NULL;
