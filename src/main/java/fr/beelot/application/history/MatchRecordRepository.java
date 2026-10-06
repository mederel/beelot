package fr.beelot.application.history;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface MatchRecordRepository extends JpaRepository<MatchRecord, UUID> {
}
