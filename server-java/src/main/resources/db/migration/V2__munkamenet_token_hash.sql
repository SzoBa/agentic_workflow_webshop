-- A munkamenet-token lenyomata tárolódik, nem maga a token (ADR-0008, spec 7.1).
--
-- A token bemutatóra szóló hitelesítő adat: nyersen tárolva az adatbázis olvasása
-- minden belépett felhasználó megszemélyesítését jelentené — pont az a kockázat,
-- ami miatt a jelszót sem tároljuk, csak a hashét.

ALTER TABLE users RENAME COLUMN token TO token_hash;
ALTER INDEX users_token_uidx RENAME TO users_token_hash_uidx;

-- A meglévő NYERS tokenekhez nem képezhető olyan lenyomat, amivel a kliens kezében
-- lévő érték tovább működne. Az átállás ezért egyszeri kiléptetés: mindenki újra belép.
UPDATE users SET token_hash = NULL, token_expires_at = NULL;

-- A hiányzó lejárat nem "örökéletű munkamenet", hanem érvénytelenség (ADR-0008).
-- A két mező csak EGYÜTT lehet kitöltve; így a fail-open állapot nem is előállítható.
-- NOT NULL nem járható út: a kijelentkezett felhasználónál mindkettő üres.
ALTER TABLE users ADD CONSTRAINT users_session_pair_chk
    CHECK ((token_hash IS NULL) = (token_expires_at IS NULL));
