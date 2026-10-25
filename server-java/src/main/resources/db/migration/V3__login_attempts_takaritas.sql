-- A lejárt bejelentkezési számlálók takarítása mostantól a HIBAÚTON fut (spec 7.2):
-- a táblába hitelesítés nélküli kérés is beszúr sort, és a támadó épp az, aki sosem
-- lép be sikeresen. A purge így minden sikertelen próbálkozásnál lefut, ezért az
-- ablak kezdete kap indexet — enélkül minden takarítás teljes tábla-olvasás lenne.

CREATE INDEX login_attempts_first_at_idx ON login_attempts (first_at);
