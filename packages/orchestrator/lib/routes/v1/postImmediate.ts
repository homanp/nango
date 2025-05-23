import { z } from 'zod';
import type { JsonValue } from 'type-fest';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import type { TaskType } from '../../types.js';
import { syncArgsSchema, actionArgsSchema, onEventArgsSchema, webhookArgsSchema, syncAbortArgsSchema } from '../../clients/validate.js';

const path = '/v1/immediate';
const method = 'POST';

export type PostImmediate = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        name: string;
        ownerKey?: string;
        group: {
            key: string;
            maxConcurrency: number;
        };
        retry: {
            count: number;
            max: number;
        };
        timeoutSettingsInSecs: {
            createdToStarted: number;
            startedToCompleted: number;
            heartbeat: number;
        };
        args: JsonValue & { type: TaskType };
    };
    Error: ApiError<'immediate_failed'>;
    Success: { taskId: string };
}>;

const validate = validateRequest<PostImmediate>({
    parseBody: (data: any) => {
        function argsSchema(data: any) {
            if ('args' in data && 'type' in data.args) {
                const taskType = data.args.type as TaskType;
                switch (taskType) {
                    case 'sync':
                        return syncArgsSchema;
                    case 'action':
                        return actionArgsSchema;
                    case 'webhook':
                        return webhookArgsSchema;
                    case 'on-event':
                        return onEventArgsSchema;
                    case 'abort':
                        return syncAbortArgsSchema;
                    default:
                        ((_exhaustiveCheck: never) => {
                            z.never();
                        })(taskType);
                }
            }
            return z.never();
        }
        const schema = z
            .object({
                name: z.string().min(1),
                ownerKey: z.string().optional().default(''), // for backwards compatibility. TODO: replace with z.string() once all callers are updated
                group: z.object({
                    key: z.string().min(1),
                    maxConcurrency: z.coerce.number()
                }),
                retry: z.object({
                    count: z.number().int(),
                    max: z.number().int()
                }),
                timeoutSettingsInSecs: z.object({
                    createdToStarted: z.number().int().positive(),
                    startedToCompleted: z.number().int().positive(),
                    heartbeat: z.number().int().positive()
                }),
                args: argsSchema(data)
            })
            .strict();
        return z
            .preprocess((o) => {
                // for backwards compatibility
                if (o && typeof o === 'object' && 'groupKey' in o) {
                    const { groupKey, ...rest } = o;
                    return { ...rest, group: { key: groupKey, maxConcurrency: 0 } };
                }
                return o;
            }, schema)
            .parse(data);
    }
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostImmediate>, res: EndpointResponse<PostImmediate>) => {
        const task = await scheduler.immediate({
            name: req.body.name,
            payload: req.body.args,
            groupKey: req.body.group.key,
            groupKeyMaxConcurrency: req.body.group.maxConcurrency,
            retryMax: req.body.retry.max,
            retryCount: req.body.retry.count,
            ownerKey: req.body.ownerKey || null,
            createdToStartedTimeoutSecs: req.body.timeoutSettingsInSecs.createdToStarted,
            startedToCompletedTimeoutSecs: req.body.timeoutSettingsInSecs.startedToCompleted,
            heartbeatTimeoutSecs: req.body.timeoutSettingsInSecs.heartbeat
        });
        if (task.isErr()) {
            res.status(500).json({ error: { code: 'immediate_failed', message: task.error.message } });
            return;
        }
        res.status(200).json({ taskId: task.value.id });
        return;
    };
};

export const route: Route<PostImmediate> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostImmediate> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
