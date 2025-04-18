import { Mina, PrivateKey, UInt64, UInt32, AccountUpdate, Field } from 'o1js';
import { CrowdFundingToken } from './CrowdFundingToken.js';
import { CrowdFunding } from './CrowdFunding.js';
import assert from 'node:assert';

const TRANSACTION_FEE = 1_000_000_000;  // 1 MINA

async function main() {
    // 设置本地区块链
    const Local = await Mina.LocalBlockchain({ proofsEnabled: true });
    Mina.setActiveInstance(Local);

    // 编译合约
    console.log('编译合约...');
    await CrowdFundingToken.compile();
    await CrowdFunding.compile();

    const [deployer, investor] = Local.testAccounts;
    console.log('部署者地址:', deployer.toBase58());
    console.log('投资者地址:', investor.toBase58());

    // 部署代币合约
    console.log('\n部署代币合约...');
    const { privateKey: tokenKey, publicKey: tokenAddress } = PrivateKey.randomKeypair();
    const token = new CrowdFundingToken(tokenAddress);

    let tx = await Mina.transaction({ sender: deployer, fee: TRANSACTION_FEE }, async () => {
        AccountUpdate.fundNewAccount(deployer);
        await token.deploy();
        await token.init();
    });
    await tx.prove();
    await tx.sign([deployer.key, tokenKey]).send();
    console.log('代币合约部署成功');

    // 部署众筹合约
    console.log('\n部署众筹合约...');
    const { privateKey: crowdfundingKey, publicKey: crowdfundingAddress } = PrivateKey.randomKeypair();
    const crowdfunding = new CrowdFunding(crowdfundingAddress);

    tx = await Mina.transaction({ sender: deployer, fee: TRANSACTION_FEE }, async () => {
        AccountUpdate.fundNewAccount(deployer);
        await crowdfunding.deploy({
            hardCap: UInt64.from(1000n * 1000000000n),  // 1000 MINA
            endTime: UInt32.from(1000n),                 // 1000个区块后结束
            tokenPrice: UInt64.from(2n * 1000000000n),   // 2 MINA per token
            tokenAddress: tokenAddress
        });
    });
    await tx.prove();
    await tx.sign([deployer.key, crowdfundingKey]).send();
    console.log('众筹合约部署成功');

    // 转移代币到众筹合约
    console.log('\n转移代币到众筹合约...');
    tx = await Mina.transaction({ sender: deployer, fee: TRANSACTION_FEE }, async () => {
        await token.transfer(tokenAddress, crowdfundingAddress, UInt64.from(500n * 1000000000n)); // 转移500个代币
    });
    await tx.prove();
    await tx.sign([tokenKey]).send();
    console.log('代币转移成功');

    // 测试投资
    console.log('\n开始测试投资...');
    const investAmount = UInt64.from(10n * 1000000000n); // 投资10 MINA
    tx = await Mina.transaction({ sender: investor, fee: TRANSACTION_FEE }, async () => {
        await crowdfunding.contribute(investAmount);
    });
    await tx.prove();
    await tx.sign([investor.key]).send();
    console.log('投资成功');

    // 检查结果
    const investorTokenBalance = Mina.getBalance(investor, token.deriveTokenId());
    console.log('投资者获得的代币数量:', investorTokenBalance.toString());
    const crowdfundingBalance = Mina.getBalance(crowdfundingAddress);
    console.log('众筹合约收到的MINA:', crowdfundingBalance.toString());
}

main().catch(err => {
    console.error('错误:', err);
    process.exit(1);
});