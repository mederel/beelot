package fr.beelot.application.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

interface AccountEmailRepository extends JpaRepository<AccountEmail, UUID> {

    Optional<AccountEmail> findByEmail(String email);
}
