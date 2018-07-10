const main = require("./mainScript.js")
const mockData = require("./mockData.js")

module.exports = async function (callback) {
  const data = mockData(artifacts)

  await main(
    data.STATES.TOKEN_SALE,
    data.STATES.DEFAULT_MILESTONE_ID,
    artifacts,
    web3.eth.accounts,
    web3)
}
