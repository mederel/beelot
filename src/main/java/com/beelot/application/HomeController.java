package com.beelot.application;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

@Path("/")
@Produces(MediaType.TEXT_HTML)
public class HomeController {

    @GET
    @Path("play/ai")
    public Response ai() { return index(); }

    @GET
    @Path("play/ai/bidding/{gameId}")
    public Response bidding() { return index(); }

    @GET
    @Path("play/ai/game/{gameId}")
    public Response game() { return index(); }

    @GET
    @Path("online/private")
    public Response privateTables() { return index(); }

    @GET
    @Path("online/private/table/{tableId}")
    public Response privateTable() { return index(); }

    @GET
    @Path("tutorial")
    public Response tutorial() { return index(); }

    @GET
    @Path("rules")
    public Response rules() { return index(); }

    @GET
    @Path("settings")
    public Response settings() { return index(); }

    private Response index() {
        try (var stream = HomeController.class.getResourceAsStream("/META-INF/resources/index.html")) {
            if (stream == null) return Response.serverError().build();
            return Response.ok(new String(stream.readAllBytes(), StandardCharsets.UTF_8)).build();
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
