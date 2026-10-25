package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.params.provider.Arguments.arguments;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import hu.webshop.common.ApiException;
import hu.webshop.common.Messages;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import java.sql.SQLException;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

/**
 * A felhasználóvalidáció egysége. A repository mockolt: itt a SZABÁLYOKAT mérjük, nem a
 * perzisztenciát — az egyediség adatbázis-szintű garanciáját az integrációs tesztek fedik.
 */
@ExtendWith(MockitoExtension.class)
class UserValidatorTest {

    @Mock
    private UserRepository users;

    @InjectMocks
    private UserValidator validator;

    @Nested
    class ValidateProfile {

        @Test
        void acceptsValidProfile() {
            assertThatCode(() -> validator.validateProfile("tesztelek", "teszt@pelda.hu",
                    "1011 Budapest, Fő utca 1.")).doesNotThrowAnyException();
        }

        @ParameterizedTest(name = "{0} karakteres név átmegy")
        @ValueSource(ints = {8, 9, 49, 50})
        void acceptsNameWithinBounds(int length) {
            assertThatCode(() -> validator.validateProfile("x".repeat(length), "teszt@pelda.hu",
                    "Cím")).doesNotThrowAnyException();
        }

        @ParameterizedTest(name = "{0} karakteres név túl rövid")
        @ValueSource(ints = {0, 1, 7})
        void rejectsShortName(int length) {
            assertThatThrownBy(() -> validator.validateProfile("x".repeat(length),
                    "teszt@pelda.hu", "Cím"))
                    .isInstanceOf(ApiException.class)
                    .hasMessage(Messages.USERNAME_TOO_SHORT);
        }

        @Test
        void missingNameBehavesAsEmpty() {
            // A null nem NPE-t okoz, hanem a „túl rövid" szabályon akad el.
            assertThatThrownBy(() -> validator.validateProfile(null, "teszt@pelda.hu", "Cím"))
                    .hasMessage(Messages.USERNAME_TOO_SHORT);
        }

        @Test
        void rejectsFiftyOneCharacterName() {
            assertThatThrownBy(() -> validator.validateProfile("x".repeat(51), "teszt@pelda.hu",
                    "Cím")).hasMessage(Messages.USERNAME_TOO_LONG);
        }

        @ParameterizedTest(name = "érvényes email: {0}")
        @ValueSource(strings = {
            "a@b.c",
            "teszt.elek@pelda.hu",
            "teszt+cimke@pelda.co.uk",
            "TESZT@PELDA.HU"
        })
        void acceptsValidEmail(String email) {
            assertThatCode(() -> validator.validateProfile("tesztelek", email, "Cím"))
                    .doesNotThrowAnyException();
        }

        @ParameterizedTest(name = "érvénytelen email: [{0}]")
        @NullAndEmptySource
        @ValueSource(strings = {
            "nemEmail",       // nincs @
            "a@b",            // nincs pont a domainben
            "a@.c",           // a @ után azonnal pont
            "@pelda.hu",      // nincs helyi rész
            "a b@pelda.hu",   // szóköz a helyi részben
            "a@pelda hu.hu",  // szóköz a domainben
            "a@@pelda.hu"     // dupla @
        })
        void rejectsInvalidEmail(String email) {
            assertThatThrownBy(() -> validator.validateProfile("tesztelek", email, "Cím"))
                    .hasMessage(Messages.EMAIL_INVALID);
        }

        @ParameterizedTest(name = "érvénytelen cím: [{0}]")
        @NullAndEmptySource
        @ValueSource(strings = {" ", "   ", "\t"})
        void requiresShippingAddress(String address) {
            assertThatThrownBy(() -> validator.validateProfile("tesztelek", "teszt@pelda.hu",
                    address)).hasMessage(Messages.ADDRESS_REQUIRED);
        }

        @Test
        void nameRuleTakesPrecedenceOverEmail() {
            // Mindkettő hibás; a hibakatalógus sorrendje szerint a névé az elsőbbség.
            assertThatThrownBy(() -> validator.validateProfile("rovid", "nemEmail", ""))
                    .hasMessage(Messages.USERNAME_TOO_SHORT);
        }

        @Test
        void validationErrorIsBadRequest() {
            ApiException ex = assertThrows(ApiException.class,
                    () -> validator.validateProfile("rovid", "teszt@pelda.hu", "Cím"));

            assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        }
    }

    @Nested
    class ValidatePassword {

        @ParameterizedTest(name = "{0} karakteres jelszó átmegy")
        @ValueSource(ints = {8, 9, 64})
        void acceptsFromEightCharacters(int length) {
            assertThatCode(() -> validator.validatePassword("x".repeat(length)))
                    .doesNotThrowAnyException();
        }

        @ParameterizedTest(name = "túl rövid jelszó: [{0}]")
        @NullAndEmptySource
        @ValueSource(strings = {"x", "1234567"})
        void rejectsShorterThanEight(String password) {
            assertThatThrownBy(() -> validator.validatePassword(password))
                    .isInstanceOf(ApiException.class)
                    .hasMessage(Messages.PASSWORD_TOO_SHORT);
        }

        @Test
        void doesNotTrimPassword() {
            // Nyolc szóköz érvényes jelszó: a szóköz is karakter (szándékos döntés).
            assertThatCode(() -> validator.validatePassword("        "))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    class RequireAvailable {

        @Test
        void acceptsFreeNameAndEmail() {
            when(users.findByUsernameIgnoreCase("tesztelek")).thenReturn(Optional.empty());
            when(users.findByEmailIgnoreCase("teszt@pelda.hu")).thenReturn(Optional.empty());

            assertThatCode(() -> validator.requireAvailable("tesztelek", "teszt@pelda.hu", null))
                    .doesNotThrowAnyException();
        }

        @Test
        void rejectsNameTakenByAnother() {
            when(users.findByUsernameIgnoreCase("tesztelek"))
                    .thenReturn(Optional.of(user("masik-felhasznalo")));

            assertThatThrownBy(() -> validator.requireAvailable("tesztelek", "teszt@pelda.hu",
                    null)).hasMessage(Messages.USERNAME_TAKEN);

            // A név ütközése után az e-mail lekérdezés már el sem indul.
            verify(users, never()).findByEmailIgnoreCase(any());
        }

        @Test
        void keepingOwnNameIsNotAConflict() {
            // Szerkesztéskor a felhasználó a saját, változatlan nevét tartja meg.
            when(users.findByUsernameIgnoreCase("tesztelek"))
                    .thenReturn(Optional.of(user("felhasznalo-1")));
            when(users.findByEmailIgnoreCase("teszt@pelda.hu")).thenReturn(Optional.empty());

            assertThatCode(() -> validator.requireAvailable("tesztelek", "teszt@pelda.hu",
                    "felhasznalo-1")).doesNotThrowAnyException();
        }

        @Test
        void rejectsEmailTakenByAnother() {
            when(users.findByUsernameIgnoreCase("tesztelek")).thenReturn(Optional.empty());
            when(users.findByEmailIgnoreCase("teszt@pelda.hu"))
                    .thenReturn(Optional.of(user("masik-felhasznalo")));

            assertThatThrownBy(() -> validator.requireAvailable("tesztelek", "teszt@pelda.hu",
                    null)).hasMessage(Messages.EMAIL_TAKEN);
        }

        @Test
        void keepingOwnEmailIsNotAConflict() {
            when(users.findByUsernameIgnoreCase("tesztelek")).thenReturn(Optional.empty());
            when(users.findByEmailIgnoreCase("teszt@pelda.hu"))
                    .thenReturn(Optional.of(user("felhasznalo-1")));

            assertThatCode(() -> validator.requireAvailable("tesztelek", "teszt@pelda.hu",
                    "felhasznalo-1")).doesNotThrowAnyException();
        }
    }

    @Nested
    class Duplicate {

        @ParameterizedTest(name = "{3}")
        @MethodSource("conflicts")
        void translatesConflictToContractMessage(String constraintName, String driverMessage,
                String expectedMessage, String label) {
            ApiException result = validator.duplicate(conflict(constraintName, driverMessage));

            assertThat(result.getMessage()).isEqualTo(expectedMessage);
            assertThat(result.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        static Stream<Arguments> conflicts() {
            return Stream.of(
                    arguments("users_email_lower", null, Messages.EMAIL_TAKEN,
                            "e-mail megszorítás neve"),
                    arguments("users_username_lower", null, Messages.USERNAME_TAKEN,
                            "felhasználónév megszorítás neve"),
                    // A megszorítás neve nem derült ki: a driver üzenete igazít el.
                    arguments(null, "Key (email)=(a@b.hu) already exists.", Messages.EMAIL_TAKEN,
                            "csak a driver üzenetében van „email\""),
                    // Semmi nem derült ki → a névütközést jelezzük (végső eset).
                    arguments(null, "duplicate key value violates unique constraint",
                            Messages.USERNAME_TAKEN, "semmi nem derült ki → névütközés"),
                    arguments(null, null, Messages.USERNAME_TAKEN,
                            "üzenet nélküli ok-lánc → névütközés"));
        }

        @Test
        void constraintNameIsCaseInsensitive() {
            ApiException result = validator.duplicate(conflict("USERS_EMAIL_LOWER", null));

            assertThat(result.getMessage()).isEqualTo(Messages.EMAIL_TAKEN);
        }

        @Test
        void nonHibernateCauseAlsoTranslates() {
            // Nincs ConstraintViolationException a láncban — csak a driver üzenete marad.
            DataIntegrityViolationException ex = new DataIntegrityViolationException(
                    "ERROR: duplicate key value violates unique constraint",
                    new SQLException("Key (email)=(a@b.hu) already exists."));

            assertThat(validator.duplicate(ex).getMessage()).isEqualTo(Messages.EMAIL_TAKEN);
        }
    }

    // --- Fixture ---

    /** Az {@code isTakenByOther} kizárólag az azonosítót nézi — a többi mező itt nem játszik. */
    private static UserEntity user(String id) {
        UserEntity user = new UserEntity();
        user.setId(id);
        return user;
    }

    /**
     * Egy egyediségi ütközés úgy, ahogy a Spring becsomagolja: DataIntegrityViolationException
     * → Hibernate ConstraintViolationException (megszorítás nevével) → SQLException (driver
     * üzenetével). Bármelyik szint hiányozhat — épp ezt méri a {@code duplicate}.
     */
    private static DataIntegrityViolationException conflict(String constraintName,
            String driverMessage) {
        SQLException root = new SQLException(driverMessage);
        org.hibernate.exception.ConstraintViolationException violation =
                new org.hibernate.exception.ConstraintViolationException(
                        "could not execute statement", root, constraintName);
        return new DataIntegrityViolationException("could not execute statement", violation);
    }
}
