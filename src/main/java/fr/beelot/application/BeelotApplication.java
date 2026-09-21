package fr.beelot.application;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class BeelotApplication {

    public static void main(String[] args) {
        SpringApplication.run(BeelotApplication.class, args);
    }
}
