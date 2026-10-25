package hu.webshop.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import hu.webshop.common.ErrorResponse;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/**
 * Hibaválasz kiírása egy interceptorból.
 *
 * <p>Az interceptor a kéréskezelés ELŐTT utasít el, tehát nincs vezérlőmetódus, amire a
 * globális hibakezelő ráülhetne — a választ itt kell kiírni. Ez a közös pont biztosítja,
 * hogy a hitelesítési és a jogosultsági elutasítás törzse pontosan ugyanolyan alakú
 * legyen, mint bármelyik másik hiba (a hibaszerződés része, K-72).
 */
@Component
public class InterceptorErrorWriter {

    private final ObjectMapper objectMapper;

    public InterceptorErrorWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void write(HttpServletResponse response, HttpStatus status, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(objectMapper.writeValueAsString(new ErrorResponse(message)));
    }
}
