import PrimerContent from "@/components/primer/PrimerContent";
import PrimerBlog from "@/components/primer/PrimerBlog";

export default function HomePage() {
  return <PrimerContent blogSection={<PrimerBlog />} />;
}
