import { Planner } from "@/components/Planner";
import { UiProvider } from "@/lib/ui";

export default function Page() {
  return (
    <UiProvider>
      <Planner />
    </UiProvider>
  );
}
