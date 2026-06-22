import AnalyseClient from "./AnalyseClient";

export default async function AnalysePage(props: PageProps<"/analyse/[id]">) {
  const { id } = await props.params;
  return <AnalyseClient id={id} />;
}
