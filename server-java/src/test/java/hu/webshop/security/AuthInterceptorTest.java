package hu.webshop.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import hu.webshop.common.Messages;
import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/**
 * A HITELESÍTÉSI kapu (401) — és csak az. A jogosultsági döntés (403) átkerült az
 * {@link AdminInterceptor}-ba, ezért itt SEMMILYEN szerepkör-ellenőrzés nem mérhető:
 * ez az osztály útvonalat sem néz, a szerepkört sem. Amit a végpontok tényleg
 * megkapnak — 401 előbb, 403 utána —, az a BEKÖTÉS sorrendjéből jön, és az
 * {@code AdminContextPathTest} integrációs teszt igazolja valódi HTTP-n.
 *
 * <p>A tesztek a HÁROM megfigyelhető hatást mérik: a visszatérési érték (fut-e a
 * kéréskezelő), a hibaválasz KÉRÉSE (státusz + üzenet), és a kérésre tett
 * felhasználó-attribútum. A hibaválasz ALAKJA (JSON-törzs, fejlécek) szándékosan nem
 * itt van mérve, hanem az {@link InterceptorErrorWriterTest}-ben — a mai felosztás
 * szerint az a másik osztály szerződése.
 */
@ExtendWith(MockitoExtension.class)
class AuthInterceptorTest {

    /** A kéréskezelő objektumot a preHandle nem használja — elég egy jelölő. */
    private static final Object HANDLER = new Object();

    @Mock
    private SessionService sessions;

    @Mock
    private InterceptorErrorWriter errors;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @InjectMocks
    private AuthInterceptor interceptor;

    @Nested
    class TokenExtraction {

        @ParameterizedTest(name = "Authorization: [{0}] → token: [{1}]")
        @CsvSource(nullValues = "NULL", value = {
            // Nincs fejléc.
            "NULL,               NULL",
            // Rossz séma, illetve hiányzó szóköz — egyik sem Bearer.
            "'Basic abc',        NULL",
            "'Bearerabc',        NULL",
            "'Bearer',           NULL",
            // A séma NAGYBETŰ-érzékeny: a kisbetűs alak nem token.
            "'bearer abc',       NULL",
            "'BEARER abc',       NULL",
            // Ép fejléc, a fölösleges szóközök nélkül.
            "'Bearer abc',       abc",
            "'Bearer   abc  ',   abc"
        })
        void tokenFromHeader(String header, String expectedToken) throws Exception {
            when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn(header);
            when(sessions.authenticate(any())).thenReturn(Optional.empty());

            interceptor.preHandle(request, response, HANDLER);

            verify(sessions).authenticate(expectedToken);
        }

        @Test
        void bareBearerYieldsEmptyToken() throws Exception {
            // Nem null, hanem üres sztring — a védelmet innen a SessionService blank
            // ellenőrzése adja, nem ez az osztály. Két osztály együttműködése.
            when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Bearer   ");
            when(sessions.authenticate(any())).thenReturn(Optional.empty());

            interceptor.preHandle(request, response, HANDLER);

            verify(sessions).authenticate("");
        }
    }

    @Nested
    class Unauthenticated {

        @Test
        void respondsWith401AndAuthRequiredMessage() throws Exception {
            when(sessions.authenticate(any())).thenReturn(Optional.empty());

            boolean proceeds = interceptor.preHandle(request, response, HANDLER);

            assertThat(proceeds).isFalse();
            verify(errors).write(response, HttpStatus.UNAUTHORIZED, Messages.AUTH_REQUIRED);
        }

        @Test
        void doesNotSetUserAttribute() throws Exception {
            when(sessions.authenticate(any())).thenReturn(Optional.empty());

            interceptor.preHandle(request, response, HANDLER);

            verify(request, never()).setAttribute(eq(AuthInterceptor.USER_ATTRIBUTE), any());
        }

        @Test
        void doesNotWriteTheResponseItself() throws Exception {
            // A törzs kiírása a hibaíró dolga; ez az osztány a válaszhoz hozzá sem nyúl.
            when(sessions.authenticate(any())).thenReturn(Optional.empty());

            interceptor.preHandle(request, response, HANDLER);

            verifyNoInteractions(response);
        }

        @ParameterizedTest(name = "{0} kijelentkezve → 401")
        @ValueSource(strings = {
            "/api/orders",
            // Az admin névtér sem kivétel: kijelentkezve 401 jár, nem 403 — különben a
            // válasz elárulná, hogy a védett névtér létezik. Itt ez nem is döntés: ez az
            // osztály az útvonalat csak a naplósorba olvassa ki.
            "/api/admin/products"
        })
        void everyPathIsTreatedAlike(String uri) throws Exception {
            when(request.getRequestURI()).thenReturn(uri);
            when(sessions.authenticate(any())).thenReturn(Optional.empty());

            assertThat(interceptor.preHandle(request, response, HANDLER)).isFalse();

            verify(errors).write(response, HttpStatus.UNAUTHORIZED, Messages.AUTH_REQUIRED);
        }
    }

    @Nested
    class Authenticated {

        @ParameterizedTest(name = "belépett {0} → továbbengedve")
        @CsvSource({"CUSTOMER", "ADMIN"})
        void passesThroughAndSetsUser(Role role) throws Exception {
            // A szerepkör itt NEM számít: mindkettő ugyanígy továbbmegy. A customer
            // kiszűrése az admin névtéren az AdminInterceptor dolga.
            UserEntity user = userWithRole(role);
            when(sessions.authenticate(any())).thenReturn(Optional.of(user));

            assertThat(interceptor.preHandle(request, response, HANDLER)).isTrue();

            verify(request).setAttribute(AuthInterceptor.USER_ATTRIBUTE, user);
            verifyNoInteractions(response, errors);
        }

        @Test
        void userAttributeKeyIsTheSharedConstant() {
            // Az AdminInterceptor és a CurrentUserArgumentResolver EBBŐL a konstansból
            // olvas; egy elírt sztring-literál csendben hitelesítés nélküli kérést
            // engedne az admin névtérre.
            assertThat(AuthInterceptor.USER_ATTRIBUTE).isEqualTo("hu.webshop.currentUser");
        }
    }

    // --- Fixture ---

    private static UserEntity userWithRole(Role role) {
        UserEntity user = new UserEntity();
        user.setId("u1");
        user.setUsername("teszt");
        user.setRole(role);
        return user;
    }
}
