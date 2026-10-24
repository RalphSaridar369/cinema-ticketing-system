import { notFound } from "next/navigation";
import { BranchMovies } from "@/components/screens/branch-movies";
import { BRANCHES, branchBySlug } from "@/lib/data";

export function generateStaticParams() {
  return BRANCHES.map((b) => ({ branch: b.slug }));
}

export default async function BranchPage({ params }: PageProps<"/branches/[branch]">) {
  const branch = branchBySlug((await params).branch);
  if (!branch) notFound();
  return <BranchMovies branchId={branch.id} />;
}
