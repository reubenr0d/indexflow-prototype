import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug, getAllPostSlugs, getPostNeighbors } from "@/lib/blog.server";
import { BlogPostLayout } from "@/components/blog/blog-post-layout";

const BASE_URL = "https://indexflow.app";

interface BlogRouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: BlogRouteParams): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return { title: "Post Not Found" };
  }

  const url = `${BASE_URL}/blog/${post.slug}`;

  return {
    title: `${post.title} | IndexFlow Blog`,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: `${post.date}T00:00:00Z`,
      authors: [post.author],
      tags: post.tags,
      ...(post.image ? { images: [{ url: post.image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      ...(post.image ? { images: [post.image] } : {}),
    },
  };
}

function BlogJsonLd({ post }: { post: { title: string; description: string; date: string; author: string; slug: string; image?: string } }) {
  const imageUrl = post.image
    ? (post.image.startsWith("http") ? post.image : `${BASE_URL}${post.image}`)
    : `${BASE_URL}/blog/${post.slug}/opengraph-image`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: `${post.date}T00:00:00Z`,
    image: imageUrl,
    author: {
      "@type": "Organization",
      name: post.author,
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "IndexFlow",
      url: BASE_URL,
    },
    url: `${BASE_URL}/blog/${post.slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/blog/${post.slug}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function BlogSlugPage({ params }: BlogRouteParams) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  const posts = await getAllPosts();
  const { prev, next } = getPostNeighbors(posts, slug);

  return (
    <>
      <BlogJsonLd post={post} />
      <BlogPostLayout post={post} prev={prev} next={next} />
    </>
  );
}
