package hu.webshop.common;

/**
 * A hibaválasz alakja — MINDIG {@code { "error": "<magyar szöveg>" }}, minden
 * végponton, minden státuszkódnál. A kliens erre az egy alakra épül.
 */
public record ErrorResponse(String error) {
}
