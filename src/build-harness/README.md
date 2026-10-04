# 从零写 Harness：浏览器执行说明

入口是 `/build-harness/`。九章提供教材、起始脚本、可运行解答和行为检查，按消息、provider、工具注册、分发、多轮循环、工作区、错误处理、停止条件、HTTP adapter 的顺序学习。

## 两份实现

- 浏览器编辑器执行学习者的 `async function main(ctx)` 脚本。学生自己组织消息、查工具、校验参数、执行与回填、控制循环。
- `public/build-harness/reference/` 是独立、零依赖的完整 JavaScript 参考。解压 `reference.zip` 后执行 `node demo.mjs`。`live.mjs` 使用用户自己设置的环境变量；自动化验证只用了本地 HTTP fixture。

教程采用课程自己的消息协议，不调用 Pi 的完整 agent。原来的 Pi 解读模块继续保留。

## 浏览器中的能力

`ctx` 包含两个虚拟文件、模拟 provider、三项文件/测试工具、事件记录和本地 mock fetch。HTTP 章节自己序列化 Chat Completions 请求；另有完整 Responses 示例。两者均按实际工具结果完成修复，默认没有密钥和模型费用。

代码在仅允许脚本的 sandbox iframe 所创建的 classic Worker 中运行。iframe 使用独立 opaque origin，Worker 的 CSP 关闭连接和远程脚本来源。测试确认了主站存储不可见、请求未发出、CPU 死循环超时后 Worker 被释放。

默认运行期限 3000ms，宿主允许的范围为 100–10000ms；单次编辑代码上限 100000 UTF-8 字节，单个序列化输出上限 200000 UTF-8 字节，事件最多保留 200 条。这些是教学环境的工程限制。停止或超时会移除执行实例，保留已送达的事件和文件快照。它用于自己的学习代码，不提供服务端级的恶意程序内存隔离。

## 如何检查

检查依据实际返回消息、调用 ID、运行器观察到的 provider/tool/HTTP 操作，以及最终文件和三个算术用例。学习者自己 emit 的标记与运行器事件分开，完成状态不会仅凭一句 PASS 或 completed 判定。

第八章的网页检查验证持续请求达到代码内轮数上限；协作取消另通过对完整解答注入实际 AbortSignal 的自动化用例验证。页面停止按钮则直接终止实例。

验证覆盖全部九个 solution、全部九个未完成 starter、Responses 示例、独立 Node demo、mock HTTP、错误参数、未知工具、截断响应、错误重试、停止和超时恢复。新的课程代码保持自托管字体，部署仍只需 `npm run build` 与 `dist`。
