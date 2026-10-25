package hu.webshop.config;

import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.stereotype.Component;

/**
 * A hiányzó {@code DATABASE_PASSWORD} beszédes indulási hibát ad (spec 7.6).
 *
 * <p>A jelszónak SZÁNDÉKOSAN nincs alapértéke: egy működő, de kitalálható tartalék
 * értékkel az elfelejtett környezeti változó csendben marad hiba, és éles telepítés is
 * elindulna vele. Enélkül viszont a hiba önmagában félrevezető: a Spring
 * konfigurációkötője a feloldatlan helyőrzőt NEM hibának tekinti, hanem szó szerint
 * továbbadja, így a szerver a {@code ${DATABASE_PASSWORD}} sztringgel próbál
 * bejelentkezni, és az adatbázis „password authentication failed" hibáját látjuk — ami
 * elhibázott jelszóra utal, nem hiányzó konfigurációra. Az üzemeltető rossz helyen
 * keresné a bajt.
 *
 * <p>Miért {@link BeanPostProcessor} a {@code DataSourceProperties}-re, és nem
 * {@code EnvironmentPostProcessor}: itt már MINDEN property-forrás a helyén van (a
 * {@code .env}, a {@code dev} profil és a tesztek dinamikus forrásai is), tehát az
 * ellenőrzés nem adhat téves riasztást — a {@code DataSourceProperties} pedig még a
 * kapcsolat felépítése előtt jön létre.
 *
 * <p>Az ÜRES érték ugyanúgy hiányzó értéknek számít, mint a feloldatlan helyőrző. Ez
 * nem szőrszálhasogatás: a {@code .env.example} minden kulcsot üresen sorol fel, és a
 * Spring helyőrző-alapértéke ({@code ${DATABASE_PASSWORD:webshop}} a {@code dev}
 * profilban) csak a HIÁNYZÓ kulcsra lép be — a jelen lévő, de üres értéket nem írja
 * felül. Enélkül a másolt {@code .env} pont azt a félrevezető „password authentication
 * failed" hibát adná, ami ellen ez az osztály készült.
 */
@Component
public class DatabasePasswordCheck implements BeanPostProcessor {

    /** A feloldatlan helyőrző alakja, ha a környezeti változó nincs beállítva. */
    static final String UNRESOLVED = "${DATABASE_PASSWORD}";

    static final String MESSAGE =
            "A DATABASE_PASSWORD nincs beállítva (hiányzik vagy üres), ezért a szerver nem"
                    + " indul el. Hitelesítő adatnak nincs alapértéke (spec 7.6). Helyi"
                    + " fejlesztéshez indítsd a `dev` profillal (mvn spring-boot:run"
                    + " -Dspring-boot.run.profiles=dev, vagy a repó gyökerében ./start.sh) ÉS"
                    + " töröld a .env-ből az üres DATABASE_PASSWORD sort; éles üzemben pedig"
                    + " add meg környezeti változóként.";

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName)
            throws BeansException {
        if (bean instanceof DataSourceProperties properties && isMissing(properties.getPassword())) {
            throw new IllegalStateException(MESSAGE);
        }
        return bean;
    }

    /** Hiányzónak számít a null, az üres/csak-szóköz érték és a feloldatlan helyőrző is. */
    static boolean isMissing(String password) {
        return password == null || password.isBlank() || UNRESOLVED.equals(password);
    }
}
