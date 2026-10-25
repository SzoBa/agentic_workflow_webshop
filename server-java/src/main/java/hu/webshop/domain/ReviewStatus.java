package hu.webshop.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Egy értékelés moderációs állapota.
 *
 * <ul>
 *   <li>{@code pending}: beküldve, még nem moderált (alapérték) — nem publikus.</li>
 *   <li>{@code approved}: jóváhagyva — ez az EGYETLEN publikus állapot (I-7).</li>
 *   <li>{@code rejected}: elutasítva — nem publikus.</li>
 *   <li>{@code removed}: utólag eltávolítva (soft delete): megmarad, de sem a
 *       publikus listában, sem az átlagban nem szerepel.</li>
 * </ul>
 */
public enum ReviewStatus {
    PENDING("pending"),
    APPROVED("approved"),
    REJECTED("rejected"),
    REMOVED("removed");

    private final String value;

    ReviewStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    /** A szöveges értékhez tartozó státusz, vagy {@code null}, ha ismeretlen. */
    public static ReviewStatus from(String raw) {
        if (raw == null) {
            return null;
        }
        for (ReviewStatus status : values()) {
            if (status.value.equals(raw)) {
                return status;
            }
        }
        return null;
    }

    @Converter(autoApply = true)
    public static class JpaConverter implements AttributeConverter<ReviewStatus, String> {
        @Override
        public String convertToDatabaseColumn(ReviewStatus attribute) {
            return attribute == null ? null : attribute.value;
        }

        @Override
        public ReviewStatus convertToEntityAttribute(String dbData) {
            return from(dbData);
        }
    }
}
