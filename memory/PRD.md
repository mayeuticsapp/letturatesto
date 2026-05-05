# PRD - Leggi Messaggi (Lettore Messaggi WhatsApp)

## Descrizione
App mobile Expo che legge ad alta voce, con voce naturale italiana, qualsiasi testo
copiato/incollato (es. messaggi di WhatsApp). Pensata per chi ha un Android e vuole
ascoltare i messaggi invece di leggerli.

## Funzionalità principali
- **Incolla testo**: pulsante dedicato per incollare dagli appunti del telefono
- **Lettura ad alta voce**: usa la sintesi vocale nativa di Android (expo-speech)
- **Pausa / Riprendi**: durante la lettura
- **Stop**: ferma la lettura in qualsiasi momento
- **Controllo velocità**: slider da 0.5x a 1.8x (Lenta → Molto veloce)
- **Selezione voce italiana**: dropdown con tutte le voci it-IT installate sul dispositivo,
  con anteprima al tap. Privilegia voci "Enhanced" (alta qualità) di default.
- **Indicatore di stato**: Pronto / In lettura / In pausa con feedback visivo colorato
- **Cancella testo**: pulsante per pulire velocemente l'area di testo
- **Funziona offline**: nessun internet, nessun account, nessun dato salvato

## Stack tecnico
- **Frontend**: Expo SDK 54 + expo-router (single screen `/app/index.tsx`)
- **TTS**: expo-speech (sintesi vocale nativa Android/iOS)
- **Clipboard**: expo-clipboard
- **UI**: React Native + @react-native-community/slider + @expo/vector-icons (Ionicons)
- **Backend**: nessuno (app 100% client-side)
- **Database**: nessuno (privacy: nulla viene salvato)

## Design
- Tema scuro stile WhatsApp (sfondo `#0b141a`, accenti verdi `#25D366`)
- Interfaccia minimalista, single-screen, pulsanti grandi (>= 44px)
- KeyboardAvoidingView + SafeAreaView

## Note di deployment
- L'utente userà l'app sul proprio Android tramite l'app Expo Go o build APK.
- Le voci italiane dipendono da quelle installate nel sistema Android
  (Impostazioni → Lingua e immissione → Sintesi vocale).
- Nell'anteprima web il browser non ha le voci di Android, quindi l'avviso
  "Nessuna voce italiana trovata" è normale solo in preview web.
