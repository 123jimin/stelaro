+++
id = "t0005"
title = "Unified reply context for Discord handlers"
tags = ["gateway", "discord"]
modifies = ["s0017"]
status = "pending"
+++

# Unified reply context for Discord handlers (NEEDS APPROVAL)

Give Discord handlers one lightweight reply interface while retaining direct
access to their raw discord.js objects.

```typescript
type ReplyContext = {
    reply(options: string | MessagePayload): Promise<Message | null>;
};

type DeferrableReplyContext = ReplyContext & {
    deferReply(options?: { ephemeral?: boolean }): Promise<boolean>;
};
```

## Completion Conditions

- Factories adapt interactions, messages, and channels. Fresh interactions use
  `reply`, deferred interactions use `editReply`, replied interactions use
  `followUp`, messages use `message.reply`, and channels use `channel.send`.
- Reply failures such as expired interactions or missing permissions return
  `null`; defer failures return `false`.
- Command, persistent-interaction, and event handler contexts expose `reply`;
  interaction-sourced contexts expose deferral where applicable.
- The existing internal `replyUserError` helper is replaced by `replyError`,
  which always uses `followUp` after deferral so the error reply is ephemeral
  regardless of how the handler deferred.
- `s0017` and tests cover every routing state and failure result.

## Out of Scope

- Discord object wrappers, widget primitives from `t0004`, and autocomplete
  responses, which use `respond()` rather than general messages.
