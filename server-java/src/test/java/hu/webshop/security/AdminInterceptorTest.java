package hu.webshop.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import hu.webshop.common.Messages;
import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

/**
 * Az admin JOGOSULTSÁGI kapu (403). A döntés bemenete EGYETLEN dolog: a kérésre tett
 * felhasználó-attribútum — útvonalat ez az osztály tudatosan nem hasonlít prefixhez
 * (K-58, lásd az osztály javadocját). Ezért itt nincs is „melyik útvonal védett" eset:
 * azt a bekötési minta dönti el, és az {@code AdminContextPathTest} méri.
 *
 * <p>A hibaválasz alakja az {@link InterceptorErrorWriterTest} szerződése; itt a
 * hibaíró mock, és a mért hatás a KÉRT státusz + üzenet.
 */
@ExtendWith(MockitoExtension.class)
class AdminInterceptorTest {

    private static final Object HANDLER = new Object();

    @Mock
    private InterceptorErrorWriter errors;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @InjectMocks
    private AdminInterceptor interceptor;

    @Nested
    class AdminUser {

        @Test
        void passesThrough() throws Exception {
            givenUserAttribute(userWithRole(Role.ADMIN));

            assertThat(interceptor.preHandle(request, response, HANDLER)).isTrue();

            // A továbbengedett kérésnél sem a válaszhoz, sem a hibaíróhoz nem nyúl.
            verifyNoInteractions(response, errors);
        }
    }

    @Nested
    class NonAdminUser {

        @Test
        void customerGets403() throws Exception {
            givenUserAttribute(userWithRole(Role.CUSTOMER));

            assertThat(interceptor.preHandle(request, response, HANDLER)).isFalse();

            verify(errors).write(response, HttpStatus.FORBIDDEN, Messages.ADMIN_REQUIRED);
        }

        @Test
        void missingRoleGets403() throws Exception {
            // A feltétel „nem ADMIN", nem „CUSTOMER" — a hiányzó szerepkör is tilt.
            // Egy új szerepkör bevezetése így alapból NEM kap admin-jogot.
            givenUserAttribute(userWithRole(null));

            assertThat(interceptor.preHandle(request, response, HANDLER)).isFalse();

            verify(errors).write(response, HttpStatus.FORBIDDEN, Messages.ADMIN_REQUIRED);
        }
    }

    /**
     * Ha az attribútum nem belépett felhasználó, a bekötés elromlott: az admin névtér
     * hitelesítés nélkül futott le. Ilyenkor ZÁRVA bukunk (401), nem átengedve — a
     * hibás konfiguráció nem válhat nyitott kapuvá.
     */
    @Nested
    class BrokenWiring {

        @ParameterizedTest(name = "attribútum = [{0}] → 401")
        @NullSource
        @ValueSource(strings = {
            // Nem UserEntity: bármi más ugyanígy elutasít. A pattern-illesztés a
            // null-t és a rossz típust EGY ágon kezeli.
            "u1",
            ""
        })
        void nonUserAttributeGives401(Object attribute) throws Exception {
            when(request.getAttribute(AuthInterceptor.USER_ATTRIBUTE)).thenReturn(attribute);

            assertThat(interceptor.preHandle(request, response, HANDLER)).isFalse();

            // 401, NEM 403: ilyenkor nem az a baj, hogy nem admin, hanem hogy nem
            // tudjuk, ki az.
            verify(errors).write(response, HttpStatus.UNAUTHORIZED, Messages.AUTH_REQUIRED);
        }
    }

    // --- Fixture ---

    private void givenUserAttribute(UserEntity user) {
        when(request.getAttribute(AuthInterceptor.USER_ATTRIBUTE)).thenReturn(user);
    }

    private static UserEntity userWithRole(Role role) {
        UserEntity user = new UserEntity();
        user.setId("u1");
        user.setUsername("teszt");
        user.setRole(role);
        return user;
    }
}
