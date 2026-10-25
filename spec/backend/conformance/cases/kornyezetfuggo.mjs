// A ⚙ jelű esetek nyilvántartása.
//
// Ezek nem futtathatók pusztán HTTP-n keresztül (konformancia.md "Használat"):
// óraállítást, újraindítást, konfigurációs felülírást vagy hibainjektálást
// igényelnek. Azért szerepelnek itt mégis, hogy a riport a TELJES 70-es
// katalógusról számoljon el, és látszódjék, mi hiányzik — egy néma
// 54/54 riport ugyanis azt hazudná, hogy minden le van fedve.
//
// Megvalósításukhoz a backendnek tesztidejű vezérlést kellene kínálnia
// (óra előreállítás vagy az ütemező kézi futtatása). Ez saját döntést és
// biztonsági megfontolást igényel, ezért külön munka.
export const kornyezetfuggoEsetek = [
  { id: "K-29", ok: "A foglalási idő letelte + az ütemező lefutása" },
  { id: "K-30", ok: "Lejárt foglalás (óraállítás vagy rövid ORDER_RESERVATION_HOURS)" },
  { id: "K-31", ok: "Lejárt foglalás utáni teljesítés" },
  { id: "K-34", ok: "Lejárt rendelés visszaállításának tiltása (előbb lejárat kell)" },
  { id: "K-47", ok: "Két EGYIDEJŰ regisztrációs kérés versenyhelyzete" },
  { id: "K-52", ok: "A rate limit túlélése szerver-újraindítás után" },
  { id: "K-53", ok: "Token-lejárat (óraállítás vagy rövid TOKEN_TTL_HOURS)" },
  { id: "K-54", ok: "Csúszó munkamenet-megújítás az élettartam felén túl" },
  {
    id: "K-56",
    ok: "Hamisított X-Forwarded-For; a K-51-gyel EGY vödröt fogyaszt, ezért nem futtatható vele egy körben",
  },
  { id: "K-57", ok: "A tárolt munkamenet-lenyomat KÖZVETLEN olvasása az adatbázisból" },
  { id: "K-58", ok: "Nem üres server.servlet.context-path melletti indítás" },
  { id: "K-72", ok: "Hibainjektálás egy kéréskezelési útvonalon" },
  { id: "K-73", ok: "Hiányzó e-mail konfiguráció (kulcsonként külön)" },
  { id: "K-74", ok: "Napló-ellenőrzés hiányzó e-mail konfiguráció mellett" },
  { id: "K-75", ok: "Érvénytelen e-mail hitelesítő adatok" },
  { id: "K-76", ok: "Üres CORS_ORIGINS melletti fejléc-ellenőrzés" },
];
