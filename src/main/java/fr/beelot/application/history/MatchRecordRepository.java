package fr.beelot.application.history;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

interface MatchRecordRepository extends JpaRepository<MatchRecord, UUID> {

    /** The matches in which the account held a seat, most recent first. */
    @Query("select distinct m from MatchRecord m join m.seats s where s.accountId = :accountId order by m.endedAt desc")
    List<MatchRecord> findPlayedBy(UUID accountId);
}
