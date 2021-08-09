import * as dice from '../../../systems/dnd5e/module/dice.js'

CONFIG.debug.hooks = false

const folder = 'modules/quick-actions'

var advMode = "normal"
var rollMode = "publicroll"
var activate = false

function _toggleEffect(event) {
    activate = true
    var actor = _getActor(event)
    const effect = actor.effects.get(event.currentTarget.dataset.effect)
    effect.update({
        disabled: !effect.data.disabled
    })
}

function _getActor(event) {
    var actorId = $(event.currentTarget).parentsUntil('.qaction-container').last().parent().data('actorid')
    var actor = game.actors.get(actorId)
    return actor
}

function _setRollMode(event) {
    rollMode = _updateToggleUI(event, ".roll-mod")
    var actor = _getActor(event)
    actor.rollMode = rollMode
}

function _setAdvMode(event) {
    advMode = _updateToggleUI(event, ".adv-mode")
    var actor = _getActor(event)
    actor.advMode = advMode
}

function _updateToggleUI(event, className) {
    $(event.currentTarget).parent().children(className).removeClass("active")
    $(event.currentTarget).addClass("active")

    return event.currentTarget.dataset.value
}

async function _quickRollAttack(event) {
    var control = event.currentTarget
    var itemid = control.parentNode.dataset.itemid
    var actor = _getActor(event)
    var attackEntity = actor.data.items.find(i => i.id === itemid)

    var spellLevels = []
    var currentLevel = 0

    if (_hasSpellLevels(attackEntity, actor)) {
        currentLevel = await _setSpellLevel(attackEntity, actor, spellLevels, currentLevel)
        return;
    } else {
        _sendRoll(actor, attackEntity, currentLevel)
    }
}

function _hasSpellLevels(attackEntity, actor) {
    return attackEntity.data._source.type == "spell" && attackEntity.data._source.data.level != 0 && actor.data.data.spells.pact.max == 0
}

async function _setSpellLevel(attackEntity, actor, spellLevels, currentLevel) {
    for (var i = attackEntity.data._source.data.level; i < 10; i++) {
        console.log(actor.data.data.spells['spell' + i])
        var spell = actor.data.data.spells['spell' + i]
        if (spell.max > 0) {
            spellLevels.push({
                level: i,
                label: game.i18n.format('DND5E.SpellLevelSlot', {
                    level: CONFIG.DND5E.spellLevels[i],
                    n: spell.max
                })
            })
        }
    }

    var spellcontent = await renderTemplate(folder + '/templates/spell-dialog.hbs', {
        item: attackEntity.data,
        spellLevels
    })

    var dialog = new Dialog({
        title: attackEntity.data.name + " : " + game.i18n.localize("DND5E.AbilityUseCast"),
        content: spellcontent,
        buttons: {
            one: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("QACT.OK"),
                callback: (event) => {
                    currentLevel = event.find("select[data-name='spellupcast']").val()
                    _sendRoll(actor, attackEntity, currentLevel)
                }
            },
            two: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("QACT.Cancel"),
                callback: () => console.log("Chose Two")
            }
        },
        default: "two",
        render: html => console.log("Register interactivity in the rendered dialog"),
        close: html => console.log("Cancel")
    })
    dialog.render(true)
    return currentLevel
}

async function _sendRoll(actor, attackEntity, currentLevel = 0) {
    if (!attackEntity.hasDamage) {

        var components = (attackEntity.labels.components || [])

        var spellDesc = await renderTemplate(folder + '/templates/spell-damage-only.hbs', {
            title: attackEntity.data.name,
            actor: actor.id,
            weapon: attackEntity.id,
            img: attackEntity.data.img,
            description: attackEntity.data.data.description.value,
            spellLevel: attackEntity.labels.level,
            save: attackEntity.labels.save,
            hasComponents: components.length > 0,
            components: components.join(',')
        })

        await ChatMessage.create({
            speaker: {
                actor: actor._id
            },
            content: spellDesc
        })
        return
    }

    var d = attackEntity.getAttackToHit()


    if (d == null) {
        var components = (attackEntity.labels.components || [])

        var spellDesc = await renderTemplate(folder + '/templates/spell-damage-only.hbs', {
            title: attackEntity.data.name,
            actor: actor.id,
            weapon: attackEntity.id,
            img: attackEntity.data.img,
            description: attackEntity.data.data.description.value,
            spellLevel: attackEntity.labels.level,
            save: attackEntity.labels.save,
            hasComponents: components.length > 0,
            components: components.join(',')
        })

        attackEntity.rollDamage({
            spellLevel: currentLevel,
            options: {
                fastForward: true,
                flavor: spellDesc
            }
        })
        return;
    }

    const actions = await renderTemplate(folder + '/templates/roll.hbs', {
        title: attackEntity.data.name,
        actor: actor.id,
        weapon: attackEntity.id,
        img: attackEntity.data.img,
        spellLevel: currentLevel,
        description: attackEntity.data.data.description.value
    })

    dice.d20Roll({
        parts: d.parts,
        critical: 20,
        data: d.rollData,
        rollMode: rollMode,
        advantage: advMode == "advantage",
        disadvantage: advMode == "disadvantage",
        fastForward: true,
        title: attackEntity.name,
        messageData: {
            speaker: {
                actor: actor.id
            }
        },
        flavor: actions
    })
}

async function addActionsTab(app, html, data) {
    const actionsTabButton = $('<a class="item" data-tab="quick-actions"> Q-Actions </a>');
    const tabs = html.find('.tabs[data-group="primary"]');
    tabs.prepend(actionsTabButton);
    const sheetBody = html.find('.sheet-body');
    const actionsTab = $(`<div class="tab actions flexcol" data-group="primary" data-tab="quick-actions"></div>`);
    sheetBody.prepend(actionsTab);

    const actions = $(await renderTemplate(folder + '/templates/actions.hbs', data))
    actionsTab.append(actions)

    var quickroll = actionsTab.find('div .quick-rollable');
    quickroll.on('click', event => _quickRollAttack(event));

    var adv = actionsTab.find('.adv-mode');
    adv.on('click', event => _setAdvMode(event))

    var mods = actionsTab.find('.roll-mod');
    mods.on('click', event => _setRollMode(event))

    var effects = actionsTab.find('.effect-control')
    effects.on('click', event => _toggleEffect(event))

    if (activate) {
        activate = false
        app._tabs[0].activate('quick-actions')
    }
}

function rollAttack(event) {
    const actor = game.actors.get(event.target.dataset.actorid)
    const weapon = actor.data.items.find(i => i.id === event.target.dataset.weaponid)

    weapon.rollDamage({
        options: {
            fastForward: true,
            critical: event.data.isCrit
        }
    })
}

Hooks.on('renderActorSheet5e', async (app, html, data) => {
    var actor = game.actors.get(data.actor._id)
    var effects = actor.effects

    var weapons = []
    var actions = []
    var spellbook = []

    data.spellbook.forEach(spellPage => {
        var page = {
            level: spellPage.order,
            label: spellPage.label,
            spells: spellPage.spells.filter(_isAttack)
        }
        spellbook.push(page)
    })

    if (data.advmode == null) {
        data.advmode = "normal"
    }

    if (data.isCharacter) {
        data.inventory.forEach(itemList => {
            if (itemList.label === 'DND5E.ItemTypeWeaponPl') {
                weapons = _getAttacks(itemList)
            }
        });
    }

    data.features.forEach(feat => {
        if (feat.label === 'Attacks') {
            weapons = weapons.concat(_getAttacks(feat))
            return
        }
        if (feat.label === 'Actions') {
            actions = actions.concat(_getAttacks(feat))
        }
        if (feat.label === 'DND5E.FeatureActive') {
            actions = actions.concat(_getAttacks(feat))
        }
    });

    actions = actions.reduce((arr, curr) => {
        var key = curr.data.activation.type
        if (arr[key]) {
            arr[key].hasItems = true
            arr[key].items.push(curr)
        }
        return arr
    }, {
        action: {
            hasItems: false,
            items: []
        },
        bonus: {
            hasItems: false,
            items: []
        },
        lair: {
            hasItems: false,
            items: []
        },
        legendary: {
            hasItems: false,
            items: []
        },
    })

    addActionsTab(app, html, {
        "weapons": weapons,
        "spellbook": spellbook,
        "actions": actions,
        "effects": effects,
        "actorid": data.actor._id,
        "disadvantage": data.advmode == "disadvantage",
        "normal": data.advmode == "normal",
        "advantage": data.advmode == "advantage",
        "public": data.mode = "public"
    })
})

Hooks.on('renderChatMessage', async (app, html, data) => {
    const atk = html.find('button[data-action="damage"]')
    const hasCritical = html.find('.critical')

    if (atk.length == 0)
        return
    atk.on('click', {
        isCrit: hasCritical.length > 0
    }, rollAttack)
})

function _getAttacks(itemList) {
    return itemList.items.filter(_isAttack)
}

function _isAttack(i) {
    return i.data.damage.parts.length > 0 || i.data.actionType === 'save'
}