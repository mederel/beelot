package fr.beelot.application.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

interface AccountRepository extends JpaRepository<Account, UUID> {

    Optional<Account> findByProviderAndProviderSubject(String provider, String providerSubject);
}
