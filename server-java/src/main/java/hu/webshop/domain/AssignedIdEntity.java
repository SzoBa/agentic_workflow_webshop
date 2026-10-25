package hu.webshop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Transient;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;
import org.springframework.data.domain.Persistable;

/**
 * Közös ős azoknak az entitásoknak, amelyek azonosítója SZÖVEG és az alkalmazás
 * adja (a seed termékek {@code p1}…{@code p8} értéke a szerződés része, ezért nem
 * cserélhető automatikus egész kulcsra).
 *
 * <p>Két dolgot old meg:
 *
 * <ul>
 *   <li>{@link Persistable}: enélkül a Spring Data a kitöltött azonosítót „létező sor"-nak
 *       hinné, és minden mentés fölösleges SELECT + MERGE lenne.</li>
 *   <li>{@code seq}: a beszúrási sorrend. Az adatbázis tölti ki (bigserial), az entitás
 *       csak olvassa — minden listázás eszerint rendez, mert a sorrend a szerződés része.</li>
 * </ul>
 */
@MappedSuperclass
public abstract class AssignedIdEntity implements Persistable<String> {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private String id;

    @Generated(event = EventType.INSERT)
    @Column(name = "seq", insertable = false, updatable = false)
    private Long seq;

    @Transient
    private boolean newEntity = true;

    @Override
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Long getSeq() {
        return seq;
    }

    @Override
    public boolean isNew() {
        return newEntity;
    }

    @PostLoad
    @PostPersist
    void markNotNew() {
        this.newEntity = false;
    }
}
