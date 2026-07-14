interface ConversationRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
}

/** 应用内切换对话：默认 replace，避免历史栈堆积与回退误触 */
export function navigateToConversation(
  router: ConversationRouter,
  conversationId: string,
  options?: { replace?: boolean },
): void {
  const href = `/chat?c=${conversationId}`;
  if (options?.replace === false) {
    router.push(href);
  } else {
    router.replace(href);
  }
}
