import {
  Kernel,
  Error,
  TimeSetter,
  Web3,
  saltHashVote,
  wweb3,
  should,
  VetXToken,
  ProjectController,
  MilestoneController,
  EtherCollector,
  PLCRVoting,
  Registry,
  TokenCollector,
  CarbonVoteX,
  ReputationSystem,
  RegulatingRating,
  RewardManager,
  RefundManager,
  PaymentManager,
  Parameterizer,
  TokenSale} from "../constants.js"

const BigNumber = require('bignumber.js')

const PROJECT_LIST = ["project0", "project1", "project2", "project3"]

const ETH_AMOUNT = 10000000000

const TOKEN_SALE_AMOUNT = 500000000000
const TOKEN_SALE_RATE = 5

const SALT = 12345
const VOTE_FOR = 1
const AGAINST = 0

const VOTE_NUMBER = 1000
const PURCHASER_DEPOSIT = 10000000

const PROJECT_STATE_NOT_EXIST = 0
const PROJECT_STATE_APP_SUBMITTED = 1
const PROJECT_STATE_APP_ACCEPTED = 2
const PROJECT_STATE_TOKEN_SALE = 3
const PROJECT_STATE_MILESTONE = 4
const PROJECT_STATE_COMPLETE = 5

const CHALLENGE_DEPOSIT = new BigNumber(Parameterizer.paramDefaults.minDeposit / 2)
const CHALLENGE_REWARD =
  new BigNumber(CHALLENGE_DEPOSIT * Parameterizer.paramDefaults.dispensationPct / 100)

const ONE_YEAR = TimeSetter.OneYear

/* ----- Milestone Mock Data --------- */
const MILESTONE_LENGTH =
  [ONE_YEAR, ONE_YEAR * 2, ONE_YEAR * 3, ONE_YEAR * 4, ONE_YEAR * 5]
const MILESTONE_OBJS =
  [['obj10', 'obj11'],
  ['obj20', 'obj21'],
  ['obj30', 'obj31'],
  ['obj40', 'obj41'],
  ['obj50', 'obj51']]
const MILESTONE_OBJ_TYPES =
  [['type10', 'type11'],
  ['type20', 'type21'],
  ['type30', 'type31'],
  ['type40', 'type41'],
  ['type50', 'type51']]
const MILESTONE_OBJ_MAX_REGULATION_REWARDS =
  [[100, 100],
  [200, 200],
  [300, 300],
  [400, 400],
  [500, 500]]
const MILESTONE_WEI_LOCKED = [10000, 20000, 30000, 40000, 50000]

const TOTAL_REWARDS = MILESTONE_OBJ_MAX_REGULATION_REWARDS
  .reduce((acc, lst) => acc + lst.reduce((acc2, n) => acc2 + n), 0)
const TOTAL_WEILOCKED = MILESTONE_WEI_LOCKED.reduce((acc, n) => acc + n)

/* ----- RegulatingRating Data --------- */
const LENGTH_FOR_RATING_STAGE = 4 * TimeSetter.OneWeek
const INTERVAL_FOR_RATING_STAGE = 2 * TimeSetter.OneWeek
const DELAY_LENGTH = 0
const POLL_LENGTH = 7
const TOTAL_VOTES_LIMIT = 1000

/* ----- RegulatingRating Data --------- */
const PURCHASER1_REFUND = [100, 110, 120, 130, 140]
const PURCHASER2_REFUND = [200, 210, 220, 230, 240]
const PURCHASER3_REFUND = [300, 310, 320, 330, 340]

contract("Integration Test", function (accounts) {
  const ROOT = accounts[0]
  const PROJECT_OWNER = accounts[1]
  const CHALLENGER = accounts[2]
  const VOTER1 = accounts[3]
  const VOTER2 = accounts[4]

  const PURCHASER1 = accounts[2]
  const PURCHASER2 = accounts[3]
  const PURCHASER3 = accounts[4]

  const INVESTOR1 = accounts[2]
  const INVESTOR2 = accounts[3]
  const REGULATOR1 = accounts[5]
  const REGULATOR2 = accounts[6]

  // Tokens
  let vetXToken
  let projectToken

  // VTCR
  let registry
  let plcrVoting

  let projectController
  let milestoneController
  let tokenCollector
  let tokenSale
  let regulatingRating
  let carbonVoteXCore
  let reputationSystem
  let etherCollector
  let rewardManager
  let refundManager
  let paymentManager


  before(async function () {
    // token(s)
    vetXToken = await VetXToken.Self.deployed()

    // vtcr system
    registry = await Registry.Self.deployed()
    plcrVoting = await PLCRVoting.Self.deployed()

    // modules
    projectController = await ProjectController.Self.deployed()
    milestoneController = await MilestoneController.Self.deployed()
    tokenSale = await TokenSale.Self.deployed()
    regulatingRating = await RegulatingRating.Self.deployed()

    // carbonvotex system
    carbonVoteXCore = await CarbonVoteX.Core.deployed()
    reputationSystem = await ReputationSystem.Self.deployed()

    // collectors
    etherCollector = await EtherCollector.Self.deployed()
    tokenCollector = await TokenCollector.Self.deployed()

    // managers
    rewardManager = await RewardManager.Self.deployed()
    refundManager = await RefundManager.Self.deployed()
    paymentManager = await PaymentManager.Self.deployed()

    // init project token and transfer all to project owner
    projectToken = await VetXToken.Self.new(
      VetXToken.initAmount,
      "ProjectToken",
      VetXToken.decimalUnits,
      "PT"
    )
    await projectToken.transfer(PROJECT_OWNER, VetXToken.initAmount)

    // Transfer VTX to voter
    await vetXToken.transfer(VOTER1, VOTE_NUMBER)
    await vetXToken.transfer(VOTER2, VOTE_NUMBER)
  })

  let deposit = async function (address, vetXTokenNum) {
    const bal = await vetXToken.balanceOf(address)
    if (bal !== 0) {
      await vetXToken.transfer(ROOT, bal, {from: address})
    }
    await vetXToken.transfer(address, vetXTokenNum)
  }

  let applyApplication = async function (projectName) {
    // Transfer minDeposit VTX to project owner
    await vetXToken.transfer(PROJECT_OWNER, Parameterizer.paramDefaults.minDeposit)
    let pre = await vetXToken.balanceOf(PROJECT_OWNER)

    // allow registry transfer minDeposit VTX from project owner
    await vetXToken.approve(
      registry.address,
      Parameterizer.paramDefaults.minDeposit,
      {from: PROJECT_OWNER}).should.be.fulfilled

    await registry.apply(
      projectName,
      Parameterizer.paramDefaults.minDeposit,
      {from: PROJECT_OWNER}).should.be.fulfilled

    let post = await vetXToken.balanceOf(PROJECT_OWNER)
    pre.minus(post).should.be.bignumber.equal(
      Parameterizer.paramDefaults.minDeposit)

    const projectHash = wweb3.utils.keccak256(projectName)
    // set token address
    await projectController.setTokenAddress(
      projectHash,
      projectToken.address
    ).should.be.fulfilled
  }

  let challengeApplication = async function (projectName) {
    // Transfer minDeposit VTX to project owner
    await vetXToken.transfer(CHALLENGER, Parameterizer.paramDefaults.minDeposit)
    let pre = await vetXToken.balanceOf(CHALLENGER)

    // allow registry transfer minDeposit VTX from project owner
    await vetXToken.approve(
      registry.address,
      Parameterizer.paramDefaults.minDeposit,
      {from: CHALLENGER}).should.be.fulfilled

    const { logs } = await registry.challenge(
      projectName,
      {from: CHALLENGER}).should.be.fulfilled
    let post = await vetXToken.balanceOf(CHALLENGER)

    const event = logs.find(e => e.event === "_Challenge")
    const pollId = event.args.pollId
    event.args.challenger.should.be.equal(CHALLENGER)

    pre.minus(post).should.be.bignumber.equal(
      Parameterizer.paramDefaults.minDeposit / 2)
    return pollId
  }

  let voteForChallenge = async function (
    pollId,
    voter,
    choice,
    tokenNum) {
      let secretHash = saltHashVote(choice, SALT)

      await vetXToken.approve(plcrVoting.address, tokenNum, {from: voter})
      await plcrVoting.requestVotingRights(
        tokenNum,
        {from: voter}).should.be.fulfilled

      await plcrVoting.commitVote(
        pollId,
        secretHash,
        tokenNum,
        0,
        {from: voter}).should.be.fulfilled
  }

  let increaseTime = async function (time) {
    const afterCommit = TimeSetter.latestTime() + time + 1
    await TimeSetter.increaseTimeTo(afterCommit)
    await TimeSetter.advanceBlock()
  }

  let revealVote = async function (
    pollId,
    voter,
    choice,
    tokenNum) {
      await plcrVoting.revealVote(
        pollId,
        choice,
        SALT,
        {from: voter}).should.be.fulfilled
  }

  let voterReward = async function (pollId, voter, tokenNum) {
    await registry.claimReward(
      pollId,
      SALT,
      {from: voter}).should.be.fulfilled
    let { logs } = await plcrVoting.withdrawVotingRights(
      tokenNum,
      {from: voter}).should.be.fulfilled
    const event = logs.find(e => e.event === "VotingRightsWithdrawn")
    event.args.voter.should.be.equal(voter)
    event.args.numTokens.should.be.bignumber.equal(tokenNum)
  }

  let mockTokenSale = async function (projectHash, rate, projectToken) {
    await deposit(PURCHASER1, PURCHASER_DEPOSIT)
    await deposit(PURCHASER2, PURCHASER_DEPOSIT)
    await deposit(PURCHASER3, PURCHASER_DEPOSIT)

    const purchaser1BalPre = await projectToken.balanceOf(PURCHASER1)
    const purchaser2BalPre = await projectToken.balanceOf(PURCHASER2)
    const purchaser3BalPre = await projectToken.balanceOf(PURCHASER3)

    await projectToken.approve(
      tokenSale.address,
      TOKEN_SALE_AMOUNT,
      {from: PROJECT_OWNER})
    await tokenSale.startTokenSale(
      projectHash,
      rate,
      projectToken.address,
      TOKEN_SALE_AMOUNT,
      {from: PROJECT_OWNER}).should.be.fulfilled

    await tokenSale.buyTokens(
      projectHash,
      {value: PURCHASER_DEPOSIT, from: PURCHASER1})
      .should.be.fulfilled

    await tokenSale.buyTokens(
      projectHash,
      {value: PURCHASER_DEPOSIT, from: PURCHASER2})
      .should.be.fulfilled

    await tokenSale.buyTokens(
      projectHash,
      {value: PURCHASER_DEPOSIT, from: PURCHASER3})
      .should.be.fulfilled

    await tokenSale.finalize(projectHash, {from: PROJECT_OWNER})
      .should.be.fulfilled
    const avgPrice = await tokenSale.avgPrice.call(projectHash)

    const purchaser1BalPost = await projectToken.balanceOf(PURCHASER1)
    const purchaser2BalPost = await projectToken.balanceOf(PURCHASER2)
    const purchaser3BalPost = await projectToken.balanceOf(PURCHASER3)

    purchaser1BalPost.minus(purchaser1BalPre)
      .should.be.bignumber.equal(PURCHASER_DEPOSIT * rate)

    /*
     * project owner can withdraw rest token that has not been sold yet
     */
    const preTokenBal = await projectToken.balanceOf(PROJECT_OWNER)
    await tokenSale.withdrawToken(projectHash, {from: PROJECT_OWNER})
      .should.be.fulfilled
    const postTokenBal = await projectToken.balanceOf(PROJECT_OWNER)
    // calculate rest token that has not been sold yet
    const restToken = TOKEN_SALE_AMOUNT - PURCHASER_DEPOSIT * rate * 3
    postTokenBal.minus(preTokenBal).should.be.bignumber.equal(restToken)

   /*
    * check the number of token sale ether that not been locked.
    */
    const res = await projectController.getProjectInfo(projectHash)
    const etherNotLocked = res[2]
    const etherNotLockedExpect = PURCHASER_DEPOSIT * 3 - TOTAL_REWARDS
    etherNotLocked.should.be.bignumber.equal(etherNotLockedExpect)

   /*
    * check the avg rate
    */
    avgPrice.should.be.bignumber.equal(rate)
  }

  let mockAddMilestone = async function (projectHash) {
    for (let i = 0; i < MILESTONE_OBJS.length; i++) {
      await milestoneController.addMilestone(
        projectHash,
        MILESTONE_LENGTH[i],
        MILESTONE_OBJS[i],
        MILESTONE_OBJ_TYPES[i],
        MILESTONE_OBJ_MAX_REGULATION_REWARDS[i],
        {from: PROJECT_OWNER}).should.be.fulfilled
    }
  }

  let repsysVote = async function (projectHash, pollId, voter, objType, regulatorAddress, votes) {
    await carbonVoteXCore.writeAvailableVotes(
      ReputationSystem.CI,
      pollId,
      voter,
      TOTAL_VOTES_LIMIT).should.be.fulfilled

    for (let i = 0; i < votes.length; i++) {
      await reputationSystem.vote(
        projectHash,
        regulatorAddress[i],
        objType[i],
        pollId,
        votes[i],
        {from: voter}).should.be.fulfilled
    }
  }

  let reputationSystemRating = async function (projectHash, milestoneId, pollTime) {
    const startTime = TimeSetter.latestTime()
    const votesInvestor1 = [100, 200]
    const votesInvestor2 = [150, 50]

    //-------- set up reputation system vote -----------
    const pollId = Web3.utils.soliditySha3(projectHash, milestoneId)

    await TimeSetter.increaseTimeTo(pollTime + TimeSetter.duration.days(1))
    await TimeSetter.advanceBlock()

    await reputationSystem.startPoll(
      projectHash,
      pollId,
      DELAY_LENGTH,
      POLL_LENGTH).should.be.fulfilled

    // CarbonVoteX vote for regulator
    await repsysVote(
      projectHash,
      pollId,
      INVESTOR1,
      MILESTONE_OBJ_TYPES[milestoneId - 1],
      [REGULATOR1, REGULATOR2],
      votesInvestor1).should.be.fulfilled

    await repsysVote(
      projectHash,
      pollId,
      INVESTOR2,
      MILESTONE_OBJ_TYPES[milestoneId - 1],
      [REGULATOR2, REGULATOR1],
      votesInvestor2).should.be.fulfilled

    let votingResultForRegulator1Obj1 = await reputationSystem.getVotingResultForMember(
      pollId,
      REGULATOR1,
      MILESTONE_OBJ_TYPES[milestoneId - 1][0])
    votingResultForRegulator1Obj1
      .should.be.bignumber.equal(votesInvestor1[0] * TOKEN_SALE_RATE)

    let votingResultForRegulator2Obj1 = await reputationSystem.getVotingResultForMember(
      pollId,
      REGULATOR2,
      MILESTONE_OBJ_TYPES[milestoneId - 1][0])
    votingResultForRegulator2Obj1
      .should.be.bignumber.equal(votesInvestor2[0] * TOKEN_SALE_RATE)

    let votingResultForRegulator1Obj2 = await reputationSystem.getVotingResultForMember(
      pollId,
      REGULATOR1,
      MILESTONE_OBJ_TYPES[milestoneId - 1][1])
    votingResultForRegulator1Obj2
      .should.be.bignumber.equal(votesInvestor2[1] * TOKEN_SALE_RATE)

    let votingResultForRegulator2Obj2 = await reputationSystem.getVotingResultForMember(
      pollId,
      REGULATOR2,
      MILESTONE_OBJ_TYPES[milestoneId - 1][1])
    votingResultForRegulator2Obj2
      .should.be.bignumber.equal(votesInvestor1[1] * TOKEN_SALE_RATE)

    const expired = await reputationSystem.pollExpired.call(pollId)
    expired.should.be.equal(true)

    // --------- start -------------
    await milestoneController.startRatingStage(
      projectHash,
      milestoneId,
      {from: PROJECT_OWNER}).should.be.fulfilled

    // increase time to starttime + interval for rating stage
    await TimeSetter.increaseTimeTo(startTime + INTERVAL_FOR_RATING_STAGE)

    await regulatingRating.bid(
      projectHash,
      milestoneId,
      MILESTONE_OBJS[milestoneId - 1][0],
      {from: REGULATOR1}).should.be.fulfilled

    await regulatingRating.bid(
      projectHash,
      milestoneId,
      MILESTONE_OBJS[milestoneId - 1][1],
      {from: REGULATOR1}).should.be.fulfilled

    await regulatingRating.bid(
      projectHash,
      milestoneId,
      MILESTONE_OBJS[milestoneId - 1][0],
      {from: REGULATOR2}).should.be.fulfilled

    await regulatingRating.bid(
      projectHash,
      milestoneId,
      MILESTONE_OBJS[milestoneId - 1][1],
      {from: REGULATOR2}).should.be.fulfilled

    // test backOutFromBid
    await regulatingRating.backOutFromBid(
      projectHash,
      milestoneId,
      MILESTONE_OBJS[milestoneId - 1][1],
      {from: REGULATOR2}).should.be.fulfilled
    await regulatingRating.bid(
      projectHash,
      milestoneId,
      MILESTONE_OBJS[milestoneId - 1][1],
      {from: REGULATOR2}).should.be.fulfilled


    // fastForwardToLastThreeWeek
    const lastWeek = pollTime + MILESTONE_LENGTH[milestoneId - 1] + 100 - 3 * TimeSetter.OneWeek
    await TimeSetter.increaseTimeTo(lastWeek)
    await TimeSetter.advanceBlock()

    // finalize bid  (founderOnly)
    await regulatingRating.finalizeAllBids(
      projectHash,
      milestoneId,
      {from: PROJECT_OWNER})

    const regulator1Reward =
      [votesInvestor1[0] /
        (votesInvestor1[0] + votesInvestor2[0]) *
        MILESTONE_OBJ_MAX_REGULATION_REWARDS[milestoneId - 1][0],
      votesInvestor2[1] /
        (votesInvestor1[1] + votesInvestor2[1]) *
        MILESTONE_OBJ_MAX_REGULATION_REWARDS[milestoneId - 1][1]]

    const regulator2Reward =
      [votesInvestor2[0] /
        (votesInvestor1[0] + votesInvestor2[0]) *
        MILESTONE_OBJ_MAX_REGULATION_REWARDS[milestoneId - 1][0],
      votesInvestor1[1] /
        (votesInvestor1[1] + votesInvestor2[1]) *
        MILESTONE_OBJ_MAX_REGULATION_REWARDS[milestoneId - 1][1]]

    // test getRegulationRewardForRegulator
    if (milestoneId != 1) {
      regulatingRating.getRegulationRewardsForRegulator(
        projectHash, milestoneId - 1,
        MILESTONE_OBJS[milestoneId - 2][0],
        REGULATOR1).should.be.fulfilled
    }

    // test whole rating system and withdraw
    let preBal, postBal
    const REGULATORS = [REGULATOR1, REGULATOR2]
    const REWARDS = [regulator1Reward, regulator2Reward]
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        preBal = await web3.eth.getBalance(etherCollector.address)
        await rewardManager.withdraw(
          projectHash,
          milestoneId,
          MILESTONE_OBJS[milestoneId - 1][i],
          {from: REGULATORS[j]})
        postBal = await web3.eth.getBalance(etherCollector.address)
        preBal.minus(postBal).should.be.bignumber.equal(REWARDS[j][i])
      }
    }
  }


  let refund = async function (projectHash, milestoneId, startTime) {
    await fastForwardToLastWeek(milestoneId, startTime)

    // any investor can start the refund stage
    await milestoneController.startRefundStage(
      projectHash,
      milestoneId,
      {from: PURCHASER1}).should.be.fulfilled

    // purchasers  refund
    const refundTable = [PURCHASER1_REFUND, PURCHASER2_REFUND, PURCHASER3_REFUND]
    const purchasers = [PURCHASER1, PURCHASER2, PURCHASER3]
    for (let i = 0; i < refundTable.length; i++) {
      await projectToken.approve(
        refundManager.address,
        refundTable[i][milestoneId - 1],
        {from: purchasers[i]}).should.be.fulfilled

      await refundManager.refund(
        projectHash,
        milestoneId,
        refundTable[i][milestoneId - 1],
        {from: purchasers[i]}).should.be.fulfilled

      // if not the first milestone, withdraw last milestone's refund
      if (milestoneId != 1) {
        const preBal = await web3.eth.getBalance(etherCollector.address)
        await refundManager.withdraw(
          projectHash,
          milestoneId - 1,
          {from: purchasers[i]}).should.be.fulfilled
        const postBal = await web3.eth.getBalance(etherCollector.address)

        preBal.minus(postBal).should.be.bignumber.equal(
          refundTable[i][milestoneId - 2] / TOKEN_SALE_RATE)
      }
    }
  }

  let fastForwardToEndOfMilestone = async function (milestoneId, startTime) {
    const endMilestone = startTime + MILESTONE_LENGTH[milestoneId - 1] + 100
    await TimeSetter.increaseTimeTo(endMilestone)
    await TimeSetter.advanceBlock()
  }

  let fastForwardToLastWeek = async function (milestoneId, startTime) {
    const lastWeek = startTime + MILESTONE_LENGTH[milestoneId - 1] + 100 - TimeSetter.OneWeek
    await TimeSetter.increaseTimeTo(lastWeek)
    await TimeSetter.advanceBlock()
  }

  let testMilestoneControllerView = async function (projectHash) {
    const milestoneControllerView = await MilestoneController.View.Self.deployed()

    const numMilestones = await milestoneControllerView.getNumberOfMilestones(projectHash)
    numMilestones.should.be.bignumber.equal(MILESTONE_LENGTH.length)

    for (let i = 0; i < numMilestones; i++) {
      const milestoneId = i + 1

      const infos = await milestoneControllerView.getMilestoneInfo(projectHash, milestoneId)
      const objInfos = await milestoneControllerView.getMilestoneObjInfo(projectHash, milestoneId)
      const length = infos[0]
      const state = infos[1]
      const startTime = infos[2]
      const endTime = infos[3]
      const weiLocked = infos[4]

      const objs = objInfos[0]
      const objTypes = objInfos[1]
      const objMaxRegulationRewards = objInfos[2]

      const expectState = await milestoneController.milestoneState(projectHash, milestoneId)

      endTime.minus(startTime).should.be.bignumber.equal(length)
      state.should.be.bignumber.equal(expectState)
      weiLocked.should.be.bignumber.equal(MILESTONE_WEI_LOCKED[i])

      objs.length.should.be.equal(MILESTONE_OBJS[i].length)
      for (let j = 0; j < objs.length; j++) {

        web3.toAscii(objs[j]).should.startWith(MILESTONE_OBJS[i][j])
        web3.toAscii(objTypes[j]).should.startWith(MILESTONE_OBJ_TYPES[i][j])
        objMaxRegulationRewards[j].should.be.bignumber.equal(MILESTONE_OBJ_MAX_REGULATION_REWARDS[i][j])
      }
    }
  }

  let userRescueTokens = async function () {
    const projectHash = wweb3.utils.keccak256(PROJECT_LIST[2])
    const VOTER1_VOTE = 100
    const VOTER2_VOTE = 200
    const VOTER1_REVEAL = 0
    const VOTER2_REVEAL = 150
    let res

    await applyApplication(PROJECT_LIST[2])

    //get and check project info
    res = await projectController.getProjectInfo(projectHash)

    res[0].should.be.equal(true) // check exist
    res[1].should.be.bignumber.equal(PROJECT_STATE_APP_SUBMITTED) // check state

    let pollId = await challengeApplication(PROJECT_LIST[2])
    await voteForChallenge(pollId, VOTER1, VOTE_FOR, 100)
    await voteForChallenge(pollId, VOTER2, VOTE_FOR, 200)
    // Fast forward to reveal stage
    await increaseTime(Parameterizer.paramDefaults.commitStageLength)

    // Only voter2 reveal vote for 150
    await revealVote(pollId, VOTER2, VOTE_FOR, 150)

    // check reveal stage
    const revealStage = await plcrVoting.revealStageActive(pollId)
    revealStage.should.be.equal(true)

    // Fast forward to the end of reveal stage
    await increaseTime(Parameterizer.paramDefaults.revealStageLength)

    // update status and check reward
    const { logs } = await registry.updateStatus(PROJECT_LIST[2]).should.be.fulfilled

    // check challenge should failed
    const ChallengeFailedEvent = logs.find(e => e.event === "_ChallengeFailed")
    should.exist(ChallengeFailedEvent)

    // check new project should be whitelisted
    const NewProjectWhitelistedEvent = logs.find(e => e.event === "_NewProjectWhitelisted")
    should.exist(NewProjectWhitelistedEvent)

    //check(get) project info
    res = await projectController.getProjectInfo(projectHash)
    res[0].should.be.equal(true) // check exist
    res[1].should.be.bignumber.equal(PROJECT_STATE_APP_ACCEPTED) // check state
    // project already in whitelisted

    /*
     * Rescue check
     */
    // Calculate locked token
    const VOTER1_TOKEN_NUMBER_CAN_BE_WITHDRAW = VOTER1_VOTE - VOTER1_REVEAL
    const VOTER2_TOKEN_NUMBER_CAN_BE_WITHDRAW = VOTER2_VOTE - VOTER2_REVEAL

    // Check locked token before resuce
    const lockedTokenVoter1 = await plcrVoting.getLockedTokens(VOTER1)
    lockedTokenVoter1.should.be.bignumber.equal(VOTER1_TOKEN_NUMBER_CAN_BE_WITHDRAW)

    // Rescue tokens
    await plcrVoting.rescueTokens(pollId, {from: VOTER1})

    // Check locked token after resuce
    const lockedTokenAfterResuceVoter1 = await plcrVoting.getLockedTokens(VOTER1)
    lockedTokenAfterResuceVoter1.should.be.bignumber.equal(0)

    // Check with draw token after resuce
    const balance = await plcrVoting.voteTokenBalance(VOTER1)
    balance.minus(lockedTokenAfterResuceVoter1)
      .should.be.bignumber.equal(VOTER1_TOKEN_NUMBER_CAN_BE_WITHDRAW)

    const preBal1 = await vetXToken.balanceOf(VOTER1)
    await plcrVoting.withdrawVotingRights(VOTER1_TOKEN_NUMBER_CAN_BE_WITHDRAW, {from: VOTER1})
      .should.be.fulfilled
    const postBal1 = await vetXToken.balanceOf(VOTER1)
    postBal1.minus(preBal1).should.be.bignumber.equal(VOTER1_TOKEN_NUMBER_CAN_BE_WITHDRAW)

    const preBal2 = await vetXToken.balanceOf(VOTER2)
    await plcrVoting.withdrawVotingRights(VOTER2_TOKEN_NUMBER_CAN_BE_WITHDRAW, {from: VOTER2})
      .should.be.fulfilled
    const postBal2 = await vetXToken.balanceOf(VOTER2)
    postBal2.minus(preBal2).should.be.bignumber.equal(VOTER2_TOKEN_NUMBER_CAN_BE_WITHDRAW)
  }

  let challengeNotPassTest = async function () {
    const projectHash = wweb3.utils.keccak256(PROJECT_LIST[0])
    let res;

    const voter1BalPre = await vetXToken.balanceOf(VOTER1)
    const voter2BalPre = await vetXToken.balanceOf(VOTER2)

    await applyApplication(PROJECT_LIST[0])

    //get and check project info
    res = await projectController.getProjectInfo(projectHash)

    res[0].should.be.equal(true) // check exist
    res[1].should.be.bignumber.equal(PROJECT_STATE_APP_SUBMITTED) // check state

    let pollId = await challengeApplication(PROJECT_LIST[0])
    await voteForChallenge(pollId, VOTER1, VOTE_FOR, 100)
    await voteForChallenge(pollId, VOTER2, AGAINST, 150)
    await increaseTime(Parameterizer.paramDefaults.commitStageLength)

    // Fast forward to reveal stage
    const revealStage = await plcrVoting.revealStageActive(pollId)
    revealStage.should.be.equal(true)

    await revealVote(pollId, VOTER1, VOTE_FOR, 100)
    await revealVote(pollId, VOTER2, AGAINST, 150)
    await increaseTime(Parameterizer.paramDefaults.revealStageLength)

    // Fast forward to end reveal stage
    const endStage = await plcrVoting.pollEnded(pollId)
    endStage.should.be.equal(true)

    const isPassed = await plcrVoting.isPassed(pollId)
    isPassed.should.be.equal(false)

    // update status and check reward
    const challengerPre = await vetXToken.balanceOf(CHALLENGER)
    const projectOwnerPre = await vetXToken.balanceOf(PROJECT_OWNER)

    const canBeWhitelisted =
      await registry.canBeWhitelisted(PROJECT_LIST[0]).should.be.fulfilled
    canBeWhitelisted.should.be.equal(false)

    const challengeCanBeResolved =
      await registry.challengeCanBeResolved(PROJECT_LIST[0]).should.be.fulfilled
    challengeCanBeResolved.should.be.equal(true)

    const { logs } = await registry.updateStatus(PROJECT_LIST[0]).should.be.fulfilled

    //get and check project info
    res = await projectController.getProjectInfo(projectHash)

    res[0].should.be.equal(false) // check exist
    res[1].should.be.bignumber.equal(PROJECT_STATE_NOT_EXIST) // check state

    const ChallengeSucceededEvent = logs.find(e => e.event === "_ChallengeSucceeded")
    should.exist(ChallengeSucceededEvent)

    const ApplicationRemovedEvent = logs.find(e => e.event === "_ApplicationRemoved")
    should.exist(ApplicationRemovedEvent)

    const challengerPost = await vetXToken.balanceOf(CHALLENGER)
    const projectOwnerPost = await vetXToken.balanceOf(PROJECT_OWNER)

    challengerPost.minus(challengerPre).should.be.bignumber.equal(
      CHALLENGE_DEPOSIT.plus(CHALLENGE_REWARD))
    projectOwnerPost.minus(projectOwnerPre).should.be.bignumber.equal(0)

    await voterReward(pollId, VOTER1, 100)
    await voterReward(pollId, VOTER2, 150)

    const voter1BalPost = await vetXToken.balanceOf(VOTER1)
    const voter2BalPost = await vetXToken.balanceOf(VOTER2)
    voter1BalPost.minus(voter1BalPre).should.be.bignumber.equal(0)
    voter2BalPost.minus(voter2BalPre)
      .should.be.bignumber.equal(CHALLENGE_DEPOSIT.minus(CHALLENGE_REWARD))
  }

  let mainTest = async function () {
    const projectHash = wweb3.utils.keccak256(PROJECT_LIST[1])
    let res;

    /* ---------- VTCR part -------------*/
    await applyApplication(PROJECT_LIST[1])

    //get and check project info
    res = await projectController.getProjectInfo(projectHash)

    res[0].should.be.equal(true) // check exist
    res[1].should.be.bignumber.equal(PROJECT_STATE_APP_SUBMITTED) // check state

    let pollId = await challengeApplication(PROJECT_LIST[1])
    await voteForChallenge(pollId, VOTER1, VOTE_FOR, 200)
    await voteForChallenge(pollId, VOTER2, AGAINST, 150)

    // Fast forward to reveal stage
    await increaseTime(Parameterizer.paramDefaults.commitStageLength)

    // Check reveal stage active
    const revealStage = await plcrVoting.revealStageActive(pollId)
    revealStage.should.be.equal(true)

    await revealVote(pollId, VOTER1, VOTE_FOR, 200)
    await revealVote(pollId, VOTER2, AGAINST, 150)

    // Fast forward to the end of reveal stage
    await increaseTime(Parameterizer.paramDefaults.revealStageLength)

    // Check poll ended
    const endStage = await plcrVoting.pollEnded(pollId)
    endStage.should.be.equal(true)

    // Check poll passed
    const isPassed = await plcrVoting.isPassed(pollId)
    isPassed.should.be.equal(true)

    // Check poll can be whitelisted
    const canBeWhitelisted =
      await registry.canBeWhitelisted(PROJECT_LIST[1]).should.be.fulfilled
    canBeWhitelisted.should.be.equal(false)

    // Check poll challenge can be resolved
    const challengeCanBeResolved =
      await registry.challengeCanBeResolved(PROJECT_LIST[1]).should.be.fulfilled
    challengeCanBeResolved.should.be.equal(true)

    // update status and check reward
    const { logs } = await registry.updateStatus(PROJECT_LIST[1]).should.be.fulfilled

    const ChallengeFailedEvent = logs.find(e => e.event === "_ChallengeFailed")
    should.exist(ChallengeFailedEvent)

    const NewProjectWhitelistedEvent = logs.find(e => e.event === "_NewProjectWhitelisted")
    should.exist(NewProjectWhitelistedEvent)

    //get and check project info
    res = await projectController.getProjectInfo(projectHash)

    res[0].should.be.equal(true) // check exist
    res[1].should.be.bignumber.equal(PROJECT_STATE_APP_ACCEPTED) // check state

    await voterReward(pollId, VOTER1, 200)
    await voterReward(pollId, VOTER2, 150)

    /* ---------- Add milestone -------------*/
    await mockAddMilestone(projectHash)

    /* ---------- TokenSale part -------------*/
    await mockTokenSale(projectHash, TOKEN_SALE_RATE, projectToken)

    //get and check project info
    res = await projectController.getProjectInfo(projectHash)

    res[0].should.be.equal(true) // check exist
    res[1].should.be.bignumber.equal(PROJECT_STATE_TOKEN_SALE) // check state

    /* ---------- Milestone Part (Rating and Refund)-------------*/
    let startTime = TimeSetter.latestTime()
    for (let i = 0; i < MILESTONE_OBJS.length; i++) {
      let milestoneId = i + 1
      // activate milestone
      await milestoneController.activate(
        projectHash,
        milestoneId,
        MILESTONE_WEI_LOCKED[i],
        startTime + TimeSetter.duration.days(1),
        startTime + TimeSetter.duration.days(3),
        {from: PROJECT_OWNER})

      await reputationSystemRating(projectHash, milestoneId, startTime)

      // increase time to last week and then test refund stage
      await refund(projectHash, milestoneId, startTime)

      // increase time to end of this milestone, ready to activate next milestone
      await fastForwardToEndOfMilestone(milestoneId, startTime)
      startTime += MILESTONE_LENGTH[i]
    }

    // After last milestone end, founder finalize the last milestone
    await milestoneController.founderFinalize(
      projectHash,
      MILESTONE_OBJS.length,
      {from: PROJECT_OWNER}).should.be.fulfilled

    /*
     * test project owner withdraw rest weilock
     */
    for (let i = 0; i < MILESTONE_OBJS.length; i++) {
      const milestoneId = i + 1
      const preBalEtherCollector = await web3.eth.getBalance(etherCollector.address)
      await paymentManager.withdraw(
        projectHash,
        milestoneId,
        {from: PROJECT_OWNER}).should.be.fulfilled
      const postBalEtherCollector = await web3.eth.getBalance(etherCollector.address)

      const withdrawExpectValue = MILESTONE_WEI_LOCKED[i] -
        (PURCHASER1_REFUND[i] + PURCHASER2_REFUND[i] + PURCHASER3_REFUND[i]) / TOKEN_SALE_RATE
      preBalEtherCollector.minus(postBalEtherCollector)
        .should.be.bignumber.equal(withdrawExpectValue)
    }

    /*
     * test after all milestone, the rest ether balance
     * (In normal, that should be 0, otherwise those ether will locked
     *    in contract forever.)
     */
    const projectInfo = await projectController.getProjectInfo.call(projectHash)
    const projectEtherBalance = projectInfo[2]

    const projectEtherExpect = PURCHASER_DEPOSIT * 3 - TOTAL_REWARDS - TOTAL_WEILOCKED
    projectEtherBalance.should.be.bignumber.equal(projectEtherExpect)

    await testMilestoneControllerView(projectHash)
  }

  describe('The integration test for VTCR', function () {
    it('async test avoid race condition', async function () {
      await challengeNotPassTest()
      await mainTest()
      await userRescueTokens()
    })
  })
})
