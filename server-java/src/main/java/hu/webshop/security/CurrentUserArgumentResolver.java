package hu.webshop.security;

import hu.webshop.common.ApiException;
import hu.webshop.domain.UserEntity;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** A {@link CurrentUser} paraméter feloldása az {@link AuthInterceptor} által letett felhasználóra. */
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class)
                && UserEntity.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        Object user = webRequest.getAttribute(
                AuthInterceptor.USER_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
        if (user == null) {
            // Ide csak akkor jutunk, ha a végpont kimaradt az interceptor mintáiból.
            throw ApiException.unauthorized();
        }
        return user;
    }
}
