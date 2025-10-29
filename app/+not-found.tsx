import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ZapOff } from "lucide-react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Page Not Found" }} />
      <View style={styles.container}>
        <ZapOff size={64} color="#2E7D32" />
        <Text style={styles.title}>This location doesn&apos;t exist</Text>
        <Text style={styles.subtitle}>
          Looks like you&apos;ve wandered off the map!
        </Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Return to Green Spaces</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#F5F9F5",
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: "#1B5E20",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: "#558B2F",
    textAlign: "center",
  },
  link: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: "#2E7D32",
    borderRadius: 12,
  },
  linkText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },
});
