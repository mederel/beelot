# ADR-001: Use Java 21 and Spring Boot for the game server

- Status: Accepted
- Date: 2026-09-02
- Decision makers: Product and engineering

## Context

Belote needs an authoritative multiplayer game server: it must keep card hands
private, validate bidding and card plays, calculate scores, manage private
tables, and restore a player after a short disconnection. The product will need
web and potentially mobile clients, so the UI must not be coupled to one Java
desktop runtime.

The first release should be quick to build and simple to operate, while leaving
room for public matchmaking, game history, and other Belote variants. Expected
early traffic does not justify a microservice architecture.

## Decision

Build a **modular monolith** with **Java 21 LTS** and the current supported
**Spring Boot 3.x** release compatible with Java 21.

Use the following server-side components:

- Spring Boot Web for HTTP APIs, authentication integration, health checks, and
  configuration.
- Spring WebSocket with an application-specific JSON message protocol for
  low-latency table events. The protocol will expose game events and state
  snapshots, not internal domain objects.
- A pure Java rules-engine module with no Spring dependency. It is the sole
  authority for dealing, bidding, legal moves, trick resolution, and scoring.
- Spring Data JPA/Hibernate with PostgreSQL for accounts, tables, completed
  match records, and durable recovery state.
- JUnit 5 for unit tests of the rules engine and Spring Boot integration tests
  for HTTP, WebSocket, and persistence boundaries.

The initial clients will consume HTTP and WebSocket APIs. Their framework is a
separate frontend decision; this ADR deliberately does not mandate JavaFX,
Vaadin, or a web UI framework.

## Rationale

Spring Boot provides a mature Java ecosystem for the required web, WebSocket,
security, persistence, observability, and testing concerns. Java 21 provides a
long-term-supported baseline and a modern language/runtime for a concise,
testable domain model.

Keeping the game rules in a framework-free module makes the most important
logic deterministic and straightforward to test. It also allows the same rules
engine to serve AI play, tutorials, simulations, and future transports without
duplicating rule logic.

A server-authoritative WebSocket connection lets clients receive timely game
updates while the server prevents illegal moves and hidden-card disclosure.

## Considered options

### JavaFX desktop application

Rejected. It could provide a Java-only local UI, but it is a weaker fit for
browser access, mobile clients, private online tables, and sharing one
authoritative game state between remote players.

### Vaadin full-stack Java UI

Rejected for the initial product. It can accelerate administrative and
form-based screens, but a card-table experience benefits from a client that
controls animations, responsive layout, and real-time interactions directly.
It can be reconsidered for back-office tools.

### Quarkus or Micronaut

Rejected for the first release. Both are capable alternatives, particularly for
small cold-start or native-image workloads. Spring Boot has the lower delivery
risk for this application because of its broad ecosystem and established
support for the required web and persistence integrations. Revisit only if
operational measurements show a material resource or startup constraint.

### Microservices

Rejected. Separating lobby, game, scoring, and identity services now would add
deployment, state-consistency, and operational complexity without a demonstrated
scaling need. Modules may be extracted later behind stable APIs if justified.

## Consequences

### Positive

- One deployable application keeps MVP development and operations simple.
- The rules engine is independently testable and reusable.
- HTTP plus WebSocket APIs support a responsive web client and future mobile
  clients.
- PostgreSQL provides durable match data and reliable reconnection recovery.

### Trade-offs and mitigations

- A custom WebSocket protocol requires explicit versioning and client/server
  contract tests. Start with a versioned envelope and documented event schema.
- A modular monolith requires module boundaries to remain meaningful. Prevent
  the web and persistence layers from bypassing the rules-engine API.
- Stateful active tables must be designed for deployment resilience. Persist
  game events or snapshots after each accepted action and restore them on
  restart before introducing multi-instance scaling.

## Implementation guidance

1. Create a Gradle or Maven multi-module project with `rules`, `application`,
   and `persistence` modules.
2. Implement and exhaustively test the rules engine before building the visual
   table.
3. Define versioned HTTP and WebSocket contracts, including reconnect and state
   snapshot messages.
4. Run the first release as one server instance with PostgreSQL; introduce a
   shared event/session mechanism only when multi-instance deployment is needed.

## Revisit when

Reassess this decision if the product requires native mobile clients, sustained
multi-instance table hosting, exceptionally low-cost infrastructure, or if the
chosen frontend approach materially changes the server integration needs.
