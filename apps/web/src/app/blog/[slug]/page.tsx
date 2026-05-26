import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug, getAllPostSlugs, getPostNeighbors, getRelatedPosts } from "@/lib/blog.server";
import type { BlogPost } from "@/lib/blog.server";
import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { SITE_URL } from "@/lib/site";

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

  const url = `${SITE_URL}/blog/${post.slug}`;
  const seoTitle = post.seoTitle ?? post.title;

  return {
    title: `${seoTitle} | IndexFlow Blog`,
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function BlogJsonLd({ post }: { post: BlogPost }) {
  const imageUrl = post.image
    ? (post.image.startsWith("http") ? post.image : `${SITE_URL}${post.image}`)
    : `${SITE_URL}/blog/${post.slug}/opengraph-image`;

  const postingLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: `${post.date}T00:00:00Z`,
    dateModified: `${post.date}T00:00:00Z`,
    image: imageUrl,
    author: {
      "@type": "Organization",
      name: post.author,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "IndexFlow",
      url: SITE_URL,
    },
    url: `${SITE_URL}/blog/${post.slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`,
    },
    keywords: post.tags.join(", "),
    wordCount: countWords(post.content),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Blog",
        item: `${SITE_URL}/blog`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: post.title,
        item: `${SITE_URL}/blog/${post.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(postingLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </>
  );
}

export default async function BlogSlugPage({ params }: BlogRouteParams) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  const posts = await getAllPosts();
  const { prev, next } = getPostNeighbors(posts, slug);
  const related = getRelatedPosts(posts, post, 3);

  return (
    <>
      <BlogJsonLd post={post} />
      <BlogPostLayout post={post} prev={prev} next={next} related={related} />
    </>
  );
}
