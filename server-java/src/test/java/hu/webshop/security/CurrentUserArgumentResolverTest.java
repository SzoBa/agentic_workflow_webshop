package hu.webshop.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import hu.webshop.common.ApiException;
import hu.webshop.common.Messages;
import hu.webshop.domain.UserEntity;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;

/**
 * A {@code @CurrentUser} paraméter feloldása. A {@link MethodParameter} VALÓS példány,
 * a lenti minta-végpontok aláírásaiból építve — mockolva a Spring reflexióját stubolnánk
 * ki, azaz a saját feltevésünket tesztelnénk.
 *
 * <p>Az osztálynak nincs függősége; az egyetlen együttműködő a kérés.
 */
@ExtendWith(MockitoExtension.class)
class CurrentUserArgumentResolverTest {

    private final CurrentUserArgumentResolver resolver = new CurrentUserArgumentResolver();

    @Mock
    private NativeWebRequest webRequest;

    @Nested
    class SupportedParameter {

        @ParameterizedTest(name = "{0}(…) → támogatott: {1}")
        @CsvSource({
            "annotalt,              true",
            // isAssignableFrom, nem típusazonosság: az alosztály is feloldható.
            "annotaltAlosztaly,     true",
            // Annotáció van, de a típus idegen — a két feltétel EGYÜTT kell.
            "annotaltIdegenTipus,   false",
            // Jó típus, de nincs annotáció: egy sima UserEntity paramétert nem visz el.
            "annotalatlan,          false",
            "annotalatlanIdegen,    false"
        })
        void onlyTheAnnotatedUserParameter(String methodName, boolean expected) {
            assertThat(resolver.supportsParameter(parameter(methodName))).isEqualTo(expected);
        }
    }

    @Nested
    class Resolution {

        @Test
        void returnsUserSetOnRequest() {
            UserEntity user = new UserEntity();
            when(webRequest.getAttribute(
                    AuthInterceptor.USER_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST))
                    .thenReturn(user);

            Object result = resolver.resolveArgument(parameter("annotalt"), null, webRequest, null);

            // Ugyanaz a példány, nem egy másolat: a kéréskezelő ezt az entitást módosítja.
            assertThat(result).isSameAs(user);
        }

        @Test
        void readsRequestScopeUnderAgreedName() {
            // Az attribútum neve az AuthInterceptor és e között az osztály között
            // KÖZÖS szerződés — a szó szerinti érték itt is rögzítve van.
            when(webRequest.getAttribute("hu.webshop.currentUser", RequestAttributes.SCOPE_REQUEST))
                    .thenReturn(new UserEntity());

            resolver.resolveArgument(parameter("annotalt"), null, webRequest, null);

            verify(webRequest).getAttribute(
                    AuthInterceptor.USER_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
        }

        @Test
        void throws401WithoutUser() {
            // Ide csak akkor jutunk, ha a végpont kimaradt az interceptor mintáiból:
            // a mock alapból null-t ad, pont ezt az esetet előállítva.
            assertThatThrownBy(
                    () -> resolver.resolveArgument(parameter("annotalt"), null, webRequest, null))
                    .isInstanceOf(ApiException.class)
                    .hasMessage(Messages.AUTH_REQUIRED)
                    .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ApiException.class))
                    .extracting(ApiException::getStatus)
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void doesNotUseOtherParameters() {
            // A mavContainer és a binderFactory null-lal is működik — a metódus hozzájuk
            // sem nyúl, ezért a tesztek végig null-t adnak nekik.
            when(webRequest.getAttribute(
                    AuthInterceptor.USER_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST))
                    .thenReturn(new UserEntity());

            assertThat(resolver.resolveArgument(parameter("annotalt"), null, webRequest, null))
                    .isNotNull();
        }
    }

    // --- Fixture ---

    /** A minta-végpont adott nevű metódusának ELSŐ paramétere valós MethodParameter-ként. */
    private static MethodParameter parameter(String methodName) {
        for (Method method : SampleEndpoints.class.getDeclaredMethods()) {
            if (method.getName().equals(methodName)) {
                return new MethodParameter(method, 0);
            }
        }
        throw new IllegalArgumentException("Nincs ilyen minta-végpont: " + methodName);
    }

    /** Valódi kéréskezelőket utánzó aláírások — csak a paraméterlistájuk számít. */
    @SuppressWarnings("unused")
    private static class SampleEndpoints {

        void annotalt(@CurrentUser UserEntity user) {
        }

        void annotaltAlosztaly(@CurrentUser SubUser user) {
        }

        void annotaltIdegenTipus(@CurrentUser String user) {
        }

        void annotalatlan(UserEntity user) {
        }

        void annotalatlanIdegen(String user) {
        }
    }

    /** A típus-ellenőrzés isAssignableFrom voltának kimutatásához. */
    private static class SubUser extends UserEntity {
    }
}
