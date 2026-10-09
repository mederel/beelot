package fr.beelot.application.account;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

interface AccountRepository extends JpaRepository<Account, UUID> {

    Optional<Account> findByProviderAndProviderSubject(String provider, String providerSubject);

    /** Which of these provider user ids have an account. */
    @Query("select a.providerSubject from Account a where a.provider = :provider and a.providerSubject in :subjects")
    Set<String> findProviderSubjects(String provider, Collection<String> subjects);
}
