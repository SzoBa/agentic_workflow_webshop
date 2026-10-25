package hu.webshop.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import hu.webshop.common.Messages;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

/**
 * A hibaszerződés az interceptor-úton. Ez az egyetlen hely, ahol egy elutasítás törzse
 * a kéréskezelő MEGHÍVÁSA ELŐTT keletkezik, tehát a globális hibakezelő nem ér el ide —
 * a törzsnek mégis pontosan ugyanolyannak kell lennie, mint bármelyik másik hibánál
 * (K-72): {@code {"error":"<magyar szöveg>"}}.
 *
 * <p>Az {@link ObjectMapper} VALÓS példány: a szerializált törzs itt maga a szerződés,
 * mockolva pont az veszne el. A válasz mock, a törzs egy {@link StringWriter}-en
 * olvasható vissza.
 */
@ExtendWith(MockitoExtension.class)
class InterceptorErrorWriterTest {

    private final InterceptorErrorWriter writer = new InterceptorErrorWriter(new ObjectMapper());

    @Mock
    private HttpServletResponse response;

    @Nested
    class ResponseBody {

        @Test
        void wrapsTheMessageInTheErrorEnvelope() throws Exception {
            StringWriter body = responseBody();

            writer.write(response, HttpStatus.UNAUTHORIZED, Messages.AUTH_REQUIRED);

            // Karakterre pontosan — az ékezetes betűk NEM \\u-escape-elve mennek ki.
            assertThat(body.toString()).isEqualTo("{\"error\":\"Bejelentkezés szükséges.\"}");
        }

        @Test
        void adminMessageKeepsItsExactWording() throws Exception {
            StringWriter body = responseBody();

            writer.write(response, HttpStatus.FORBIDDEN, Messages.ADMIN_REQUIRED);

            assertThat(body.toString())
                    .isEqualTo("{\"error\":\"Ehhez adminisztrátori jogosultság szükséges.\"}");
        }

        @Test
        void escapesJsonSpecialCharacters() throws Exception {
            // Az üzenet a szerializálón megy át, nem sztring-összefűzéssel készül, ezért
            // egy idézőjel nem tudja megtörni a törzs alakját.
            StringWriter body = responseBody();

            writer.write(response, HttpStatus.BAD_REQUEST, "Idézőjel: \" és backslash: \\");

            assertThat(body.toString())
                    .isEqualTo("{\"error\":\"Idézőjel: \\\" és backslash: \\\\\"}");
        }

        @Test
        void nullMessageStaysWellFormedJson() throws Exception {
            // Nem hívási mód, de ha mégis megtörténik, a kliens akkor is a megszokott
            // alakot kapja — nem üres törzset és nem kivételt.
            StringWriter body = responseBody();

            writer.write(response, HttpStatus.INTERNAL_SERVER_ERROR, null);

            assertThat(body.toString()).isEqualTo("{\"error\":null}");
        }
    }

    @Nested
    class ResponseHeaders {

        @ParameterizedTest(name = "{0} → status {1}")
        @CsvSource({
            "UNAUTHORIZED,            401",
            "FORBIDDEN,               403",
            "INTERNAL_SERVER_ERROR,   500"
        })
        void statusComesFromTheEnum(HttpStatus status, int expectedCode) throws Exception {
            responseBody();

            writer.write(response, status, "hiba");

            verifyStatus(expectedCode);
        }

        @Test
        void setsJsonContentTypeAndUtf8Charset() throws Exception {
            // A charset nem elhagyható: ékezetes törzsnél a konténer alapértelmezett
            // kódlapja elrontaná a szöveget.
            responseBody();

            writer.write(response, HttpStatus.UNAUTHORIZED, Messages.AUTH_REQUIRED);

            verify(response).setContentType(MediaType.APPLICATION_JSON_VALUE);
            verify(response).setCharacterEncoding("UTF-8");
        }
    }

    // --- Fixture ---

    private void verifyStatus(int expectedCode) {
        verify(response).setStatus(expectedCode);
    }

    /**
     * A válasz törzsének olvasható tükre. A hibaíró {@code getWriter()}-t használ és
     * NEM flush-öl (az a szervlet-konténer dolga), ezért az autoflush itt kötelező —
     * enélkül a törzs üresnek látszana.
     */
    private StringWriter responseBody() throws IOException {
        StringWriter body = new StringWriter();
        when(response.getWriter()).thenReturn(new PrintWriter(body, true));
        return body;
    }
}
