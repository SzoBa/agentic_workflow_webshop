package hu.webshop.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * A belépett felhasználó kéréskezelő-paraméterként:
 * {@code @CurrentUser UserEntity user}.
 *
 * <p>Csak olyan végponton használható, amelyet az {@link AuthInterceptor} véd —
 * a hitelesítés ott dől el, itt már csak a feloldás történik.
 */
@Documented
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentUser {
}
