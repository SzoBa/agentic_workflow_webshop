package hu.webshop.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Jogosultsági szint. Az admin a customer fölé rendelt szerepkör.
 *
 * <p>A szerződésben (JSON és adatbázis) kisbetűs a szó, ezért a {@link #value}
 * mezőt használjuk mindkét irányban — sosem a Java konstans nevét.
 */
public enum Role {
    CUSTOMER("customer"),
    ADMIN("admin");

    private final String value;

    Role(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    /** A szöveges értékhez tartozó szerepkör, vagy {@code null}, ha ismeretlen. */
    public static Role from(String raw) {
        if (raw == null) {
            return null;
        }
        for (Role role : values()) {
            if (role.value.equals(raw)) {
                return role;
            }
        }
        return null;
    }

    @Converter(autoApply = true)
    public static class JpaConverter implements AttributeConverter<Role, String> {
        @Override
        public String convertToDatabaseColumn(Role attribute) {
            return attribute == null ? null : attribute.value;
        }

        @Override
        public Role convertToEntityAttribute(String dbData) {
            return from(dbData);
        }
    }
}
