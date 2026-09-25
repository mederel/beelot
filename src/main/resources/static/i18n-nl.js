// Dutch (Nederlands) locale. Registers itself for i18n.js, which must load after this file.
window.beelotLocales = window.beelotLocales || {};

(() => {
  const suits = { clubs: "klaveren", diamonds: "ruiten", hearts: "harten", spades: "schoppen" };
  const rankNames = { A: "aas", K: "heer", Q: "vrouw", J: "boer" };
  const rankLabels = { A: "A", K: "H", Q: "V", J: "B" };
  const you = (name) => name === "You";

  const dictionary = {
    // Document
    "Beelot — Play Belote": "Beelot — Speel Belote",
    "Start a game of Belote.": "Start een spelletje Belote.",
    "Beelot home": "Beelot startpagina",
    "Settings": "Instellingen",
    "Game highlights": "Spelhoogtepunten",
    "Game modes": "Spelmodi",

    // Home
    "Belote, remixed ✨": "Belote, geremixt ✨",
    "Deal in.": "Deel uit.",
    "Good times": "Een gezellige tijd",
    "await.": "wacht op je.",
    "Quick games, clever plays and big table energy. Challenge our bots or bring your favourite people.":
      "Snelle potjes, slimme zetten en een geweldige tafelsfeer. Daag onze bots uit of nodig je favoriete mensen uit.",
    "⚡ Jump in instantly": "⚡ Speel meteen",
    "♣ Classic & Contrée": "♣ Klassiek en Contrée",
    "♥ Better with friends": "♥ Leuker met vrienden",
    "Quick game": "Snel spel",
    "Grab a seat and take on three lively bots.": "Ga zitten en neem het op tegen drie levendige bots.",
    "Bring the crew": "Breng je maten mee",
    "Open a private table and invite your favourite rivals.": "Open een privétafel en nodig je favoriete rivalen uit.",
    "Learn the moves": "Leer de basis",
    "Master trump and tricks without the pressure.": "Beheers troef en slagen zonder druk.",
    "Table talk": "Tafelpraat",
    "Everything you need to settle a rules debate.": "Alles wat je nodig hebt om een discussie over de regels te beslechten.",
    "Shuffle up, team up, and race to 1,000 points.": "Schud de kaarten, vorm een team en race naar 1.000 punten.",

    // Bot setup
    "Your table is ready ⚡": "Je tafel is klaar ⚡",
    "Pick your vibe.": "Kies je stijl.",
    "Choose your flavour of Belote and how spicy you want the competition.":
      "Kies je variant van Belote en hoe pittig de tegenstand mag zijn.",
    "Game variant": "Spelvariant",
    "Classic Belote": "Klassieke Belote",
    "Contrée": "Contrée",
    "Traditional upcard bidding.": "Traditioneel bieden op de opengedraaide kaart.",
    "Contract auction with coinche.": "Contractveiling met coinche.",
    "Bot difficulty": "Moeilijkheid van de bots",
    "Relaxed": "Ontspannen",
    "A gentler game to learn and practise.": "Een rustiger spel om te leren en te oefenen.",
    "Challenging": "Uitdagend",
    "More demanding opponents for experienced players.": "Veeleisender tegenstanders voor ervaren spelers.",
    "Deal the cards": "Deel de kaarten uit",
    "Back to game modes": "Terug naar spelmodi",

    // Bot game
    "Bot card room": "Kaartkamer met bots",
    "Bots ·": "Bots ·",
    "Team scores": "Teamscores",
    "North–South": "Noord–Zuid",
    "East–West": "Oost–West",
    "VS": "VS",
    "Game status": "Spelstatus",
    "Trump": "Troef",
    "Contract": "Contract",
    "Turn": "Beurt",
    "Four-player card table": "Kaarttafel voor vier spelers",
    "Trick": "Slag",
    "Play the opening card": "Speel de openingskaart",
    "Your eight cards": "Je acht kaarten",
    "Your five cards": "Je vijf kaarten",
    "Collect trick": "Slag ophalen",
    "Deal next round": "Volgende ronde delen",
    "Rematch": "Revanche",
    "Rules reference": "Spelregels",
    "Leave table": "Tafel verlaten",

    // Bidding
    "Choose trump": "Kies troef",
    "Make your call.": "Maak je keuze.",
    "Bidding table with four players": "Biedtafel met vier spelers",
    "Upturned card": "Opengedraaide kaart",
    "Your five-card hand": "Je hand van vijf kaarten",
    "Your eight-card hand": "Je hand van acht kaarten",
    "Accept upturned suit": "Opengedraaide kleur nemen",
    "Pass": "Passen",
    "Choose a trump suit": "Kies een troefkleur",
    "Clubs ♣": "Klaveren ♣",
    "Diamonds ♦": "Ruiten ♦",
    "Hearts ♥": "Harten ♥",
    "Spades ♠": "Schoppen ♠",
    "No contract yet": "Nog geen contract",
    "Contract value": "Contractwaarde",
    "Trump suit": "Troefkleur",
    "Make bid": "Bieden",
    "Coinche": "Coinche",
    "Coinche!": "Coinche!",
    "{0} passes.": "{0} past.",
    "{0} takes with {1}.": "{0} kiest {1} als troef.",
    "Contrée auction": "Contrée-veiling",
    "Current contract: {0} {1} by {2}": "Huidig contract: {0} {1} van {2}",

    // Private tables
    "Friends, rivals, legends ♥": "Vrienden, rivalen, legendes ♥",
    "Bring the crew.": "Breng je maten mee.",
    "Make a room in seconds or use a six-character invite to jump into the fun.":
      "Maak in enkele seconden een kamer aan of gebruik een uitnodigingscode van zes tekens om mee te doen.",
    "Create a table": "Tafel aanmaken",
    "Your name": "Je naam",
    "Player": "Speler",
    "Create private table": "Privétafel aanmaken",
    "Join friends": "Bij vrienden aansluiten",
    "Invitation code": "Uitnodigingscode",
    "Join table": "Aan tafel aansluiten",
    "Private table": "Privétafel",
    "Gather your team.": "Verzamel je team.",
    "Copy": "Kopiëren",
    "Copied": "Gekopieerd",
    "Private table seats": "Plaatsen aan de privétafel",
    "Turn timer": "Beurttimer",
    "No timer": "Geen timer",
    "30 seconds": "30 seconden",
    "60 seconds": "60 seconden",
    "Save": "Opslaan",
    "I am ready": "Ik ben klaar",
    "Not ready": "Niet klaar",
    "Start game": "Spel starten",
    "Start now with bots": "Nu starten met bots",
    "Auction": "Veiling",
    "Private game status": "Status van het privéspel",
    "Declaring team": "Biedend team",
    "Private team scores": "Teamscores van de privétafel",
    "Four-player private card table": "Privé kaarttafel voor vier spelers",
    "Your cards": "Je kaarten",
    "Current trick": "Huidige slag",
    "Bid": "Bieden",
    "Game started": "Spel gestart",
    "(you)": "(jij)",
    "You": "Jij",
    "{0} (you)": "{0} (jij)",
    "Ready": "Klaar",
    "Waiting": "Wachtend",
    "Bot takeover": "Overgenomen door een bot",
    "Disconnected": "Verbinding verbroken",
    "Connected": "Verbonden",
    "Four players must be ready before the table owner can start the game, or the owner can start now and fill empty seats with bots.":
      "Vier spelers moeten klaar zijn voordat de tafeleigenaar het spel kan starten, of de eigenaar start meteen en vult lege plaatsen met bots.",
    "Turn timer: {0} seconds. A warning appears with 10 seconds remaining; an expired turn is played by a bot.":
      "Beurttimer: {0} seconden. Bij 10 seconden resterend verschijnt een waarschuwing; een verlopen beurt wordt door een bot gespeeld.",
    "Turn timer is disabled.": "De beurttimer is uitgeschakeld.",
    "Variant: {0}": "Variant: {0}",
    "The game has started. Calls and card play update for every player automatically.":
      "Het spel is begonnen. Biedingen en gespeelde kaarten worden automatisch bijgewerkt voor alle spelers.",
    "That table is no longer available.": "Die tafel is niet meer beschikbaar.",
    "No upturned card in Contrée.": "Geen opengedraaide kaart in Contrée.",
    "Something went wrong. Please try again.": "Er is iets misgegaan. Probeer het opnieuw.",

    // Tutorial
    "Learn Belote": "Leer Belote",
    "Tutorial": "Tutorial",
    "Next lesson": "Volgende les",
    "Finish tutorial": "Tutorial afronden",
    "Replay tutorial": "Tutorial opnieuw spelen",
    "Lesson {0} of {1}": "Les {0} van {1}",
    "Choose a card to continue.": "Kies een kaart om verder te gaan.",
    "Not quite. Look at the highlighted card, then try the next lesson.":
      "Niet helemaal. Kijk naar de gemarkeerde kaart en probeer dan de volgende les.",
    "Trump wins": "Troef wint",
    "Hearts are trump. Which card is strongest?": "Harten is troef. Welke kaart is het sterkst?",
    "Correct. At trump, the jack is the strongest card.": "Juist. In troef is de boer de sterkste kaart.",
    "Normal card strength": "Gewone kaartwaarde",
    "Clubs are not trump. Which card wins this trick?": "Klaveren is geen troef. Welke kaart wint deze slag?",
    "Correct. Outside trump, ace is stronger than 10.": "Juist. Buiten troef is de aas sterker dan de 10.",
    "Follow suit": "Kleur bekennen",
    "Hearts were led. Which card must you play if these are your choices?":
      "Harten werd uitgespeeld. Welke kaart moet je spelen als dit je keuzes zijn?",
    "Correct. You must follow the lead suit when you can.": "Juist. Je moet de uitgespeelde kleur bekennen als je kunt.",
    "Take the trick": "De slag winnen",
    "Spades are trump and clubs were led. Which card takes this trick?":
      "Schoppen is troef en klaveren werd uitgespeeld. Welke kaart wint deze slag?",
    "Correct. A trump card beats cards in the lead suit.": "Juist. Een troefkaart verslaat kaarten van de uitgespeelde kleur.",

    // Rules
    "Classic suit-trump Belote, played to 1,000 points. Tout-Atout and Sans-Atout are not part of this variant.":
      "Klassieke Belote met een troefkleur, gespeeld tot 1.000 punten. Tout-Atout en Sans-Atout maken geen deel uit van deze variant.",
    "Deal and trump": "Delen en troef",
    "Each player receives five cards and one card is turned face up. First, accept that suit or pass. After all pass, choose another suit; a second all-pass redeals.":
      "Elke speler krijgt vijf kaarten en één kaart wordt opengedraaid. Neem eerst die kleur of pas. Als iedereen past, kies dan een andere kleur; als iedereen een tweede keer past, wordt er opnieuw gedeeld.",
    "Card order": "Rangorde van de kaarten",
    "At trump: jack, 9, ace, 10, king, queen, 8, 7. In other suits: ace, 10, king, queen, jack, 9, 8, 7.":
      "In troef: boer, 9, aas, 10, heer, vrouw, 8, 7. In andere kleuren: aas, 10, heer, vrouw, boer, 9, 8, 7.",
    "Playing a card": "Een kaart spelen",
    "Follow the lead suit when possible. If void and an opponent wins, trump and overtrump when able. If your partner wins, you may discard.":
      "Bekend de uitgespeelde kleur als dat kan. Heb je die niet en wint een tegenstander, troef dan en overtroef als je kunt. Wint je partner, dan mag je afgooien.",
    "Scoring": "Puntentelling",
    "Card points total 162, including 10 points for the last trick (Dix de der). The declaring team needs 82 points. King and queen of trump declare Belote/Rebelote for 20 points.":
      "De kaartpunten tellen op tot 162, inclusief 10 punten voor de laatste slag (Dix de der). Het biedende team heeft 82 punten nodig. Heer en vrouw van troef melden Belote/Rebelote voor 20 punten.",
    "Contrée variant": "Contrée-variant",
    "All eight cards are dealt before an auction from 80 to 160, in steps of 10. Each call names a trump suit and must raise the current contract. Three passes after a bid close the auction. An opponent may coinche, doubling the round score; Belote/Rebelote remains active.":
      "Alle acht kaarten worden gedeeld vóór een veiling van 80 tot 160, in stappen van 10. Elk bod noemt een troefkleur en moet het huidige contract verhogen. Drie keer passen na een bod sluit de veiling. Een tegenstander mag coincheren, waarmee de score van de ronde verdubbelt; Belote/Rebelote blijft geldig.",

    // Settings
    "Preferences": "Voorkeuren",
    "Language": "Taal",
    "Choose the language of the interface.": "Kies de taal van de interface.",
    "Sound effects": "Geluidseffecten",
    "Enable optional game sounds.": "Optionele spelgeluiden inschakelen.",
    "Reduce motion": "Minder beweging",
    "Disable movement and transition effects.": "Beweging en overgangseffecten uitschakelen.",
    "Cards always use both a suit symbol and colour. Controls support touch and keyboard use.":
      "Kaarten gebruiken altijd zowel een kleursymbool als een kleur. De bediening werkt met aanraking en toetsenbord.",

    // Game board (client-built)
    "Contract: {0} {1}{2}": "Contract: {0} {1}{2}",
    " · coinched": " · gecoinched",
    "{0} are trump": "{0} is troef",
    "Contract made": "Contract gehaald",
    "Contract failed": "Contract mislukt",
    "Contract made.": "Contract gehaald.",
    "Contract failed.": "Contract mislukt.",
    "{0}'s turn · {1} of 8 tricks completed": "{0} is aan de beurt · {1} van 8 slagen gespeeld",
    "{0} win the match!": "{0} wint de partij!",
    "Match score — North–South {0} · East–West {1}": "Partijstand — Noord–Zuid {0} · Oost–West {1}",
    " Belote/Rebelote bonus: {0} points.": " Belote/Rebelote-bonus: {0} punten.",
    "Dealing the remaining cards…": "De resterende kaarten worden gedeeld…",
    "Dealer": "Gever",
    "{0} · You": "{0} · Jij",
    "{0} · {1} bots": "{0} · bots: {1}",
    "{0}, {1}, {2}{3}": "{0}, {1}, {2}{3}",
    ", active player": ", speler aan de beurt",
    "+{0} pts": "+{0} pnt",
    "{0} wins the trick for {1} points": "{0} wint de slag voor {1} punten",
    "Play {0}": "Speel {0}",
    "{0} of {1}": "{0} van {1}",
    "Coinche doubles the awarded scores. {0}": "Coinche verdubbelt de toegekende scores. {0}",
    "North–South: {0} card points + {1} Dix de der + {2} Belote = {3}. East–West: {4} card points + {5} Dix de der + {6} Belote = {7}.":
      "Noord–Zuid: {0} kaartpunten + {1} Dix de der + {2} Belote = {3}. Oost–West: {4} kaartpunten + {5} Dix de der + {6} Belote = {7}.",

    // Server messages
    "Eight cards have been dealt. Bid from 80 to 160 or pass.": "Er zijn acht kaarten gedeeld. Bied van 80 tot 160 of pas.",
    "Five cards have been dealt. Accept the upturned suit or pass.": "Er zijn vijf kaarten gedeeld. Neem de opengedraaide kleur of pas.",
    "Everyone passed. The cards have been redealt.": "Iedereen heeft gepast. De kaarten zijn opnieuw gedeeld.",
    "Everyone passed twice. The cards have been redealt.": "Iedereen heeft twee keer gepast. De kaarten zijn opnieuw gedeeld.",
    "Bot game not found": "Botpartij niet gevonden",
    "This match has ended. Start a rematch.": "Deze partij is afgelopen. Start een revanche.",
    "The auction is still in progress.": "De veiling is nog bezig.",
    "A Belote table needs four players.": "Een Belote-tafel heeft vier spelers nodig.",
    "Choose a contract value and suit in Contrée.": "Kies een contractwaarde en kleur in Contrée.",
    "In the first round, you may only accept the upturned suit.": "In de eerste ronde mag je alleen de opengedraaide kleur nemen.",
    "Choose a suit other than the upturned suit.": "Kies een andere kleur dan de opengedraaide kleur.",
    "Choose a trump suit for the contract.": "Kies een troefkleur voor het contract.",
    "A Contrée bid must be from 80 to 160 in steps of 10.": "Een bod in Contrée moet tussen 80 en 160 liggen, in stappen van 10.",
    "Your bid must be higher than the current contract.": "Je bod moet hoger zijn dan het huidige contract.",
    "Only an opponent of the declaring team may coinche.": "Alleen een tegenstander van het biedende team mag coincheren.",
    "Contract bids are only available in Contrée.": "Contractbiedingen zijn alleen beschikbaar in Contrée.",
    "The auction has ended.": "De veiling is afgelopen.",
    "It is not your turn to bid.": "Je bent niet aan de beurt om te bieden.",
    "The invitation code is invalid.": "De uitnodigingscode is ongeldig.",
    "The auction has not finished.": "De veiling is nog niet afgelopen.",
    "You are not authorized for this table.": "Je hebt geen toegang tot deze tafel.",
    "This game has not started.": "Dit spel is nog niet gestart.",
    "This table does not exist.": "Deze tafel bestaat niet.",
    "Enter a player name.": "Vul een spelersnaam in.",
    "This table has already started.": "Deze tafel is al begonnen.",
    "This table is full.": "Deze tafel is vol.",
    "A bot has taken over this seat for the rest of the match.": "Een bot heeft deze plaats overgenomen voor de rest van de partij.",
    "Only the table owner can start the game.": "Alleen de tafeleigenaar kan het spel starten.",
    "Four ready players are required to start the game.": "Er zijn vier spelers nodig die klaar zijn om het spel te starten.",
    "Every seated player must be ready to start with bots.": "Elke gezeten speler moet klaar zijn om met bots te starten.",
    "Only the table owner can change the turn timer.": "Alleen de tafeleigenaar kan de beurttimer wijzigen.",
    "The turn timer cannot change after the game starts.": "De beurttimer kan niet meer worden gewijzigd nadat het spel is gestart.",
    "Choose no timer, 30 seconds, or 60 seconds.": "Kies geen timer, 30 seconden of 60 seconden.",
    "You are not seated at this table.": "Je zit niet aan deze tafel.",
    "It is not your turn to play.": "Je bent niet aan de beurt om te spelen.",
    "That card is not a legal play.": "Die kaart mag niet gespeeld worden.",
    "This round has ended.": "Deze ronde is afgelopen.",
    "There is no completed trick to continue from.": "Er is geen afgeronde slag om mee verder te gaan.",
    "Unknown player": "Onbekende speler"
  };

  // Server messages that embed names, suits or numbers. Handlers receive the regex captures.
  const patterns = (suitWord) => [
    [/^(.+) is deciding\.$/, (name) => (you(name) ? "Jij denkt na." : `${name} denkt na.`)],
    [new RegExp(`^(.+) bids (\\d+) ${suitWord}\\.$`), (name, value, suit) =>
      `${you(name) ? "Jij biedt" : `${name} biedt`} ${value} ${suitName(suit, false)}.`],
    [/^(.+) coinches the contract\.$/, (name) => `${you(name) ? "Jij coincheert" : `${name} coincheert`} het contract.`],
    [new RegExp(`^The (\\d+) ${suitWord} contract is accepted\\.$`), (value, suit) =>
      `Het contract van ${value} ${suitName(suit, false)} is aangenomen.`],
    [new RegExp(`^Everyone passed\\. Choose any trump suit except ${suitWord}\\.$`), (suit) =>
      `Iedereen heeft gepast. Kies een willekeurige troefkleur behalve ${suitName(suit, false)}.`],
    [/^(.+) declares Belote\.$/, (name) => `${you(name) ? "Jij meldt" : `${name} meldt`} Belote.`],
    [/^(.+) declares Rebelote: 20 bonus points\.$/, (name) =>
      `${you(name) ? "Jij meldt" : `${name} meldt`} Rebelote: 20 bonuspunten.`],
    [/^Bot game not found: (.+)$/, () => "Botpartij niet gevonden."],
    [new RegExp(`^(\\d+) ${suitWord}$`), (value, suit) => `${value} ${suitName(suit)}`],
    [new RegExp(`^${suitWord}$`), (suit) => suitName(suit)],
    [/^(\d+) cards?$/, (count) => `${count} ${Number(count) <= 1 ? "kaart" : "kaarten"}`]
  ];

  // Faces read as one word ("Hartenboer"), pip cards as "Harten 10".
  const cardName = (rank, suit) => {
    const text = rankNames[rank] ? `${suit}${rankNames[rank]}` : `${suit} ${rank}`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  window.beelotLocales.nl = { dictionary, suits, rankNames, rankLabels, cardName, patterns };
})();
