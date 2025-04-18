/**
 * 零知识投票系统 - 递归证明实现
 * 
 * 设计思路：
 * 1. 成员验证
 *    - targetHash 存储成员列表的 Merkle Root
 *    - 用于验证投票者是否为有效成员
 * 
 * 2. 递归证明
 *    - 每次投票验证成员身份
 *    - 生成包含身份验证的证明
 */

import {
    Field,
    Bool,
    ZkProgram,
    Provable,
    Poseidon,
    PublicKey,
} from 'o1js';

export const VotingProgram = ZkProgram({
    name: "voting-program",
    publicInput: Field,

    methods: {
        vote: {
            privateInputs: [Field, Bool, PublicKey],
            async method(
                membersRoot: Field,    // 成员列表的根哈希
                prevCount: Field,      // 当前计数
                choice: Bool,          // 投票选择
                voter: PublicKey       // 投票者的公钥
            ) {
                // 1. 验证投票者身份
                const voterHash = Poseidon.hash(voter.toFields());
                membersRoot.assertEquals(voterHash);  // 直接比较哈希值是否相等

                // 2. 更新计数
                Provable.if(
                    choice,
                    prevCount.add(1),  // 赞成票 +1
                    prevCount          // 反对票不变
                );
            }
        }
    }
});
