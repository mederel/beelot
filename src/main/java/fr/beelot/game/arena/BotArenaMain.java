package fr.beelot.game.arena;

import fr.beelot.game.GameVariant;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Runs the bot arena from the command line, in both variants by default, and writes the report to a file.
 * Options: {@code --first}, {@code --second}, {@code --deals}, {@code --seed}, {@code --variant classic|contree|both},
 * {@code --report}.
 */
public final class BotArenaMain {

    private BotArenaMain() {
    }

    public static void main(String[] args) throws IOException {
        Map<String, String> options = new HashMap<>(Map.of("first", "current", "second", "random",
                "deals", "10000", "seed", "1", "variant", "both", "report", "build/reports/bot-arena/report.txt"));
        for (int index = 0; index + 1 < args.length; index += 2) {
            if (!args[index].startsWith("--")) throw new IllegalArgumentException("Unexpected argument " + args[index]);
            options.put(args[index].substring(2), args[index + 1]);
        }
        List<GameVariant> variants = switch (options.get("variant")) {
            case "classic" -> List.of(GameVariant.CLASSIC);
            case "contree" -> List.of(GameVariant.CONTREE);
            case "both" -> List.of(GameVariant.CLASSIC, GameVariant.CONTREE);
            default -> throw new IllegalArgumentException("Variant must be classic, contree or both.");
        };
        BotArena arena = new BotArena(ArenaBot.named(options.get("first")), ArenaBot.named(options.get("second")));
        StringBuilder report = new StringBuilder();
        for (GameVariant variant : variants) {
            String section = arena.run(variant, Integer.parseInt(options.get("deals")),
                    Long.parseLong(options.get("seed"))).format();
            System.out.println(section);
            report.append(section).append(System.lineSeparator());
        }
        Path reportFile = Path.of(options.get("report"));
        if (reportFile.getParent() != null) Files.createDirectories(reportFile.getParent());
        Files.writeString(reportFile, report);
        System.out.println("Report written to " + reportFile.toAbsolutePath());
    }
}
