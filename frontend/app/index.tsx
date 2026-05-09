import React, { useEffect, useState, useCallback } from "react";
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import Slider from "@react-native-community/slider";

type Voice = Speech.Voice;
type Status = "idle" | "speaking" | "paused";

// Limite di caratteri per chiamata a Speech.speak (limite nativo di expo-speech è 4000)
const CHUNK_LIMIT = 3800;

/**
 * Divide un testo lungo in pezzi da leggere in sequenza,
 * cercando di tagliare su confini di frase per una lettura naturale.
 */
function splitIntoChunks(text: string, maxLen: number = CHUNK_LIMIT): string[] {
  const clean = text.trim();
  if (clean.length <= maxLen) return [clean];

  const chunks: string[] = [];
  let remaining = clean;

  while (remaining.length > maxLen) {
    const slice = remaining.slice(0, maxLen);
    const breakers = [". ", "! ", "? ", "\n", "; ", ", ", " "];
    let cutAt = -1;
    for (const b of breakers) {
      const idx = slice.lastIndexOf(b);
      if (idx > maxLen * 0.5) {
        cutAt = idx + b.length;
        break;
      }
    }
    if (cutAt === -1) cutAt = maxLen;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// Simboli Unicode usati al posto delle icone (per evitare problemi di caricamento font)
const SYM = {
  chat: "💬",
  clipboard: "📋",
  trash: "🗑",
  play: "▶",
  pause: "❚❚",
  stop: "■",
  speed: "⚡",
  mic: "🎙",
  chevron: "›",
  check: "✓",
  close: "✕",
};

export default function Index() {
  const [text, setText] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [rate, setRate] = useState<number>(1.0);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [voiceModalVisible, setVoiceModalVisible] = useState<boolean>(false);
  const [loadingVoices, setLoadingVoices] = useState<boolean>(true);

  // Coda di chunk da leggere in sequenza per gestire testi lunghi (>4000 caratteri)
  const queueRef = React.useRef<string[]>([]);
  const queueIndexRef = React.useRef<number>(0);

  const loadVoices = useCallback(async () => {
    try {
      const all = await Speech.getAvailableVoicesAsync();
      const italian = all.filter((v) =>
        v.language?.toLowerCase().startsWith("it")
      );
      setVoices(italian);
      if (italian.length > 0) {
        const enhanced = italian.find(
          (v) => v.quality === Speech.VoiceQuality.Enhanced
        );
        setSelectedVoice(enhanced ?? italian[0]);
      }
    } catch (e) {
      console.log("Errore caricamento voci:", e);
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    loadVoices();
    return () => {
      Speech.stop();
    };
  }, [loadVoices]);

  const speakChunk = useCallback(
    (chunk: string, isLast: boolean) => {
      Speech.speak(chunk, {
        language: "it-IT",
        rate: rate,
        pitch: 1.0,
        voice: selectedVoice?.identifier,
        onStart: () => setStatus("speaking"),
        onDone: () => {
          if (isLast) {
            setStatus("idle");
            queueRef.current = [];
            queueIndexRef.current = 0;
          } else {
            queueIndexRef.current += 1;
            const next = queueRef.current[queueIndexRef.current];
            const last =
              queueIndexRef.current === queueRef.current.length - 1;
            if (next) speakChunk(next, last);
          }
        },
        onStopped: () => {
          setStatus("idle");
          queueRef.current = [];
          queueIndexRef.current = 0;
        },
        onError: () => {
          setStatus("idle");
          queueRef.current = [];
          queueIndexRef.current = 0;
          Alert.alert(
            "Errore",
            "Impossibile leggere il testo. Riprova o cambia voce."
          );
        },
      });
    },
    [rate, selectedVoice]
  );

  const handleSpeak = async () => {
    if (!text.trim()) {
      Alert.alert(
        "Nessun testo",
        "Incolla o scrivi un messaggio prima di leggerlo."
      );
      return;
    }

    if (status === "paused") {
      try {
        await Speech.resume();
        setStatus("speaking");
        return;
      } catch {
        // fallback: riavvia
      }
    }

    if (status === "speaking") return;

    const chunks = splitIntoChunks(text);
    queueRef.current = chunks;
    queueIndexRef.current = 0;
    speakChunk(chunks[0], chunks.length === 1);
  };

  const handlePause = async () => {
    try {
      await Speech.pause();
      setStatus("paused");
    } catch {
      await Speech.stop();
      setStatus("idle");
    }
  };

  const handleStop = async () => {
    queueRef.current = [];
    queueIndexRef.current = 0;
    await Speech.stop();
    setStatus("idle");
  };

  const handlePaste = async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip && clip.trim().length > 0) {
        setText(clip);
      } else {
        Alert.alert(
          "Appunti vuoti",
          "Non c'è nessun testo copiato negli appunti."
        );
      }
    } catch {
      Alert.alert("Errore", "Impossibile leggere gli appunti.");
    }
  };

  const handleClear = () => {
    if (status !== "idle") {
      Speech.stop();
      setStatus("idle");
    }
    setText("");
  };

  const formatRate = (v: number) => {
    if (v < 0.85) return "Lenta";
    if (v < 1.15) return "Normale";
    if (v < 1.5) return "Veloce";
    return "Molto veloce";
  };

  const renderVoiceItem = ({ item }: { item: Voice }) => {
    const isSelected = selectedVoice?.identifier === item.identifier;
    return (
      <TouchableOpacity
        testID={`voice-option-${item.identifier}`}
        style={[styles.voiceItem, isSelected && styles.voiceItemSelected]}
        onPress={() => {
          setSelectedVoice(item);
          setVoiceModalVisible(false);
          Speech.stop();
          Speech.speak("Ciao, sono la tua voce.", {
            language: "it-IT",
            voice: item.identifier,
            rate: rate,
          });
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.voiceName}>
            {item.name || item.identifier}
          </Text>
          <Text style={styles.voiceMeta}>
            {item.language}
            {item.quality === Speech.VoiceQuality.Enhanced
              ? "  •  Alta qualità"
              : ""}
          </Text>
        </View>
        {isSelected && (
          <Text style={styles.checkMark}>{SYM.check}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const isSpeaking = status === "speaking";
  const isPaused = status === "paused";
  const isIdle = status === "idle";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header} testID="app-header">
            <View style={styles.logoBadge}>
              <Text style={styles.logoEmoji}>{SYM.chat}</Text>
            </View>
            <View>
              <Text style={styles.appTitle}>Leggi Messaggi</Text>
              <Text style={styles.appSubtitle}>
                Incolla, premi e ascolta
              </Text>
            </View>
          </View>

          {/* Stato corrente */}
          <View
            style={[
              styles.statusBar,
              isSpeaking && styles.statusSpeaking,
              isPaused && styles.statusPaused,
            ]}
            testID="status-indicator"
          >
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {isSpeaking
                ? "In lettura..."
                : isPaused
                ? "In pausa"
                : "Pronto"}
            </Text>
          </View>

          {/* Area testo */}
          <View style={styles.textCard}>
            <View style={styles.textHeader}>
              <Text style={styles.label}>Il tuo messaggio</Text>
              <Text style={styles.charCount}>{text.length}</Text>
            </View>
            <TextInput
              testID="message-input"
              style={styles.textInput}
              multiline
              placeholder="Incolla qui il messaggio di WhatsApp..."
              placeholderTextColor="#6b7280"
              value={text}
              onChangeText={setText}
              textAlignVertical="top"
            />
            <View style={styles.textActions}>
              <TouchableOpacity
                testID="paste-button"
                style={styles.smallBtn}
                onPress={handlePaste}
              >
                <Text style={styles.smallBtnIcon}>{SYM.clipboard}</Text>
                <Text style={styles.smallBtnText}>Incolla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="clear-button"
                style={styles.smallBtn}
                onPress={handleClear}
                disabled={!text}
              >
                <Text
                  style={[
                    styles.smallBtnIcon,
                    { color: text ? "#ef4444" : "#4b5563" },
                  ]}
                >
                  {SYM.trash}
                </Text>
                <Text
                  style={[
                    styles.smallBtnText,
                    { color: text ? "#ef4444" : "#4b5563" },
                  ]}
                >
                  Cancella
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pulsante principale */}
          <TouchableOpacity
            testID="play-button"
            activeOpacity={0.85}
            style={[
              styles.mainButton,
              isSpeaking && styles.mainButtonActive,
            ]}
            onPress={isSpeaking ? handlePause : handleSpeak}
          >
            <Text style={styles.mainButtonIcon}>
              {isSpeaking ? SYM.pause : SYM.play}
            </Text>
            <Text style={styles.mainButtonText}>
              {isSpeaking ? "Pausa" : isPaused ? "Riprendi" : "Leggi"}
            </Text>
          </TouchableOpacity>

          {/* Pulsante stop */}
          <TouchableOpacity
            testID="stop-button"
            style={[
              styles.stopButton,
              isIdle && styles.stopButtonDisabled,
            ]}
            onPress={handleStop}
            disabled={isIdle}
          >
            <Text
              style={[
                styles.stopButtonIcon,
                { color: isIdle ? "#4b5563" : "#fff" },
              ]}
            >
              {SYM.stop}
            </Text>
            <Text
              style={[
                styles.stopButtonText,
                { color: isIdle ? "#4b5563" : "#fff" },
              ]}
            >
              Ferma lettura
            </Text>
          </TouchableOpacity>

          {/* Velocità */}
          <View style={styles.controlCard}>
            <View style={styles.controlHeader}>
              <View style={styles.controlTitleRow}>
                <Text style={styles.controlIcon}>{SYM.speed}</Text>
                <Text style={styles.controlTitle}>Velocità</Text>
              </View>
              <Text style={styles.controlValue}>
                {formatRate(rate)} ({rate.toFixed(2)}x)
              </Text>
            </View>
            <Slider
              testID="rate-slider"
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={1.8}
              step={0.05}
              value={rate}
              onValueChange={setRate}
              minimumTrackTintColor="#25D366"
              maximumTrackTintColor="#374151"
              thumbTintColor="#25D366"
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>Lenta</Text>
              <Text style={styles.sliderLabel}>Veloce</Text>
            </View>
          </View>

          {/* Voce */}
          <TouchableOpacity
            testID="voice-selector"
            style={styles.controlCard}
            activeOpacity={0.85}
            onPress={() => setVoiceModalVisible(true)}
          >
            <View style={styles.controlHeader}>
              <View style={styles.controlTitleRow}>
                <Text style={styles.controlIcon}>{SYM.mic}</Text>
                <Text style={styles.controlTitle}>Voce italiana</Text>
              </View>
              <Text style={styles.chevronIcon}>{SYM.chevron}</Text>
            </View>
            {loadingVoices ? (
              <ActivityIndicator color="#25D366" style={{ marginTop: 8 }} />
            ) : voices.length === 0 ? (
              <Text style={styles.voiceWarning}>
                Nessuna voce italiana trovata sul dispositivo. Vai nelle
                impostazioni Android → Lingua e immissione → Sintesi vocale per
                installarne una.
              </Text>
            ) : (
              <Text style={styles.controlValue} numberOfLines={1}>
                {selectedVoice?.name || selectedVoice?.identifier || "—"}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footer}>
            Funziona offline • Usa la sintesi vocale del tuo telefono
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal voci */}
      <Modal
        visible={voiceModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setVoiceModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet} testID="voice-modal">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Scegli la voce</Text>
              <TouchableOpacity
                testID="close-voice-modal"
                onPress={() => setVoiceModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeIcon}>{SYM.close}</Text>
              </TouchableOpacity>
            </View>
            {voices.length === 0 ? (
              <Text style={styles.voiceWarning}>
                Nessuna voce italiana disponibile.
              </Text>
            ) : (
              <FlatList
                data={voices}
                keyExtractor={(item) => item.identifier}
                renderItem={renderVoiceItem}
                contentContainerStyle={{ paddingBottom: 24 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0b141a",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
  logoEmoji: {
    fontSize: 22,
  },
  appTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  appSubtitle: {
    color: "#9ca3af",
    fontSize: 13,
    marginTop: 2,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111b21",
    borderWidth: 1,
    borderColor: "#1f2c34",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusSpeaking: {
    borderColor: "#25D366",
    backgroundColor: "#0f2419",
  },
  statusPaused: {
    borderColor: "#f59e0b",
    backgroundColor: "#241a0f",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9ca3af",
  },
  statusText: {
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "500",
  },
  textCard: {
    backgroundColor: "#111b21",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f2c34",
    padding: 16,
    marginBottom: 16,
  },
  textHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  label: {
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "600",
  },
  charCount: {
    color: "#6b7280",
    fontSize: 12,
  },
  textInput: {
    color: "#fff",
    fontSize: 16,
    minHeight: 140,
    maxHeight: 240,
    backgroundColor: "#0b141a",
    borderRadius: 12,
    padding: 14,
    lineHeight: 22,
  },
  textActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  smallBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0b141a",
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#1f2c34",
  },
  smallBtnIcon: {
    fontSize: 16,
    color: "#25D366",
  },
  smallBtnText: {
    color: "#25D366",
    fontSize: 14,
    fontWeight: "600",
  },
  mainButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#25D366",
    paddingVertical: 20,
    borderRadius: 18,
    marginBottom: 10,
  },
  mainButtonActive: {
    backgroundColor: "#f59e0b",
  },
  mainButtonIcon: {
    color: "#0b141a",
    fontSize: 24,
    fontWeight: "900",
  },
  mainButtonText: {
    color: "#0b141a",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1f2c34",
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 18,
  },
  stopButtonDisabled: {
    backgroundColor: "#111b21",
  },
  stopButtonIcon: {
    fontSize: 14,
    fontWeight: "900",
  },
  stopButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  controlCard: {
    backgroundColor: "#111b21",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f2c34",
    padding: 16,
    marginBottom: 14,
  },
  controlHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  controlTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlIcon: {
    fontSize: 16,
  },
  controlTitle: {
    color: "#e5e7eb",
    fontSize: 15,
    fontWeight: "600",
  },
  controlValue: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "500",
    maxWidth: 200,
  },
  chevronIcon: {
    color: "#9ca3af",
    fontSize: 22,
    fontWeight: "300",
  },
  slider: {
    marginTop: 12,
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
  },
  sliderLabel: {
    color: "#6b7280",
    fontSize: 12,
  },
  voiceWarning: {
    color: "#fbbf24",
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  footer: {
    color: "#4b5563",
    fontSize: 12,
    textAlign: "center",
    marginTop: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0b141a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: "75%",
    borderTopWidth: 1,
    borderColor: "#1f2c34",
  },
  modalHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  closeIcon: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "300",
    paddingHorizontal: 4,
  },
  voiceItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111b21",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1f2c34",
  },
  voiceItemSelected: {
    borderColor: "#25D366",
    backgroundColor: "#0f2419",
  },
  voiceName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  voiceMeta: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 2,
  },
  checkMark: {
    color: "#25D366",
    fontSize: 22,
    fontWeight: "900",
  },
});
