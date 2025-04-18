import {
    Field,
    Mina,
    AccountUpdate,
    UInt64,
    UInt32,
    PrivateKey,
    PublicKey
} from 'o1js';
import { getProfiler } from '../utils/profiler.js';
import { CrowdfundingContract } from "../crowd-funding-zkapp.js";

const CrowdfundingProfiler = getProfiler('Crowdfunding Local Deploy');
CrowdfundingProfiler.start('Deploy flow');

// 格式化 MINA 金额
function formatMina(amount: UInt64): string {
    return (Number(amount.toBigInt()) / 1e9).toFixed(2);
}

async function main() {
    console.log('启动本地部署流程...');

    // 设置本地区块链
    const doProofs = true;
    let Local = await Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);

    // 编译合约
    console.log('编译合约...');
    if (doProofs) {
        await CrowdfundingContract.compile();
    } else {
        await CrowdfundingContract.analyzeMethods();
    }

    // 获取测试账户
    let [deployer, beneficiary, investor1, investor2] = Local.testAccounts;

    // 记录初始余额
    console.log('\n初始余额状态:');
    console.log('部署者余额:', formatMina(Mina.getBalance(deployer)), 'MINA');
    console.log('受益人余额:', formatMina(Mina.getBalance(beneficiary)), 'MINA');
    console.log('投资者1余额:', formatMina(Mina.getBalance(investor1)), 'MINA');
    console.log('投资者2余额:', formatMina(Mina.getBalance(investor2)), 'MINA');

    // 创建合约账户
    console.log('\n创建合约账户...');
    let zkappKey = PrivateKey.random();
    let zkappAccount = zkappKey.toPublicKey();
    let zkapp = new CrowdfundingContract(zkappAccount);

    // 获取当前区块高度
    const currentSlot = Local.getNetworkState().globalSlotSinceGenesis;

    try {
        console.log('\n部署合约...');
        const tx = await Mina.transaction(
            {
                sender: deployer,
                fee: 0.1 * 1e9,
                memo: 'Deploy Crowdfunding Contract'
            },
            async () => {
                AccountUpdate.fundNewAccount(deployer);
                await zkapp.deploy({
                    verificationKey: undefined,
                    beneficiary: beneficiary,
                    hardCap: UInt64.from(10 * 1e9), // 硬顶：10 MINA
                    endTime: UInt32.from(currentSlot.add(100)) // 结束时间：当前时间 + 100个区块
                });
            }
        );

        console.log('等待交易证明...');
        await tx.prove();

        console.log('签名交易...');
        const signedTx = await tx.sign([deployer.key, zkappKey]).send();

        console.log('部署成功!');
        console.log('合约地址:', zkappAccount.toBase58());

    } catch (error: any) {
        console.error('\n部署失败:', error.message);
        process.exit(1);
    }

    CrowdfundingProfiler.stop().store();
}

// 运行部署脚本
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });