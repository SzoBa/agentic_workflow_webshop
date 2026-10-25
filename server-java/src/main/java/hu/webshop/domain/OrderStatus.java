package hu.webshop.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * A rendelés teljesítési státusza — az érvényes értékek EGYETLEN forrása.
 *
 * <ul>
 *   <li>{@code pending}: leadva. CSAK ez foglal készletet.</li>
 *   <li>{@code expired}: a foglalása lejárt, a készlete felszabadult. Nem végállapot:
 *       az admin utólag is teljesítheti, ha a fizikai készlet fedezi.</li>
 *   <li>{@code delivered}: kiszállítva. Végállapot; ekkor csökken a {@code stock}.</li>
 * </ul>
 *
 * <p>A felsorolás sorrendje a hibaüzenetbe is beleszámít
 * ("A rendelés státusza csak a következő lehet: pending, expired, delivered.").
 */
public enum OrderStatus {
    PENDING("pending"),
    EXPIRED("expired"),
    DELIVERED("delivered");

    private final String value;

    OrderStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    /** A szöveges értékhez tartozó státusz, vagy {@code null}, ha ismeretlen. */
    public static OrderStatus from(String raw) {
        if (raw == null) {
            return null;
        }
        for (OrderStatus status : values()) {
            if (status.value.equals(raw)) {
                return status;
            }
        }
        return null;
    }

    /** Az érvényes értékek felsorolása a hibaüzenethez, a fenti sorrendben. */
    public static String listed() {
        return Arrays.stream(values()).map(OrderStatus::value).collect(Collectors.joining(", "));
    }

    @Converter(autoApply = true)
    public static class JpaConverter implements AttributeConverter<OrderStatus, String> {
        @Override
        public String convertToDatabaseColumn(OrderStatus attribute) {
            return attribute == null ? null : attribute.value;
        }

        @Override
        public OrderStatus convertToEntityAttribute(String dbData) {
            return from(dbData);
        }
    }
}
