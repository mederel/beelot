package fr.beelot.application.account;

import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;

import java.util.UUID;

/** What Hibernate creates by reflection for the account table, which the native image must keep. */
class AccountRuntimeHints implements RuntimeHintsRegistrar {

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        hints.reflection().registerType(UUID[].class);
    }
}
